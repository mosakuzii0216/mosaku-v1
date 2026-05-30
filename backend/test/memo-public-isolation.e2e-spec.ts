/**
 * memo-public-isolation の統合テスト（Task 3.2 / 3.3）。
 *
 * 公開読み取り経路と編集経路の「アクセス境界」と「メトリクス発出源の分離」を、
 * AppModule をフルロードした実アプリ（本物のグローバル JWT Guard / ThrottlerGuard /
 * コントローラスコープ Interceptor 群）で HTTP 経由検証する。
 *
 * - Task 3.2: `@Public()` opt-out / グローバル JWT Guard 維持 / Cache-Control 維持 /
 *   公開経路は GET のみの読み取り専用（認可バイパス新設なし）。
 * - Task 3.3: 公開経路は `public_memo_read` のみ発出し編集経路（`memo_edit_read`）と
 *   混線しないこと。レート制限超過の 429 は Interceptor 到達前に Guard 段で弾かれ
 *   `public_memo_read` には現れず、公開 req レート = served + throttled の和で算出される。
 */

jest.mock('@sentry/nestjs', () => {
	const actual = jest.requireActual<typeof import('@sentry/nestjs')>('@sentry/nestjs');
	return {
		...actual,
		init: jest.fn(),
		captureMessage: jest.fn(),
		captureException: jest.fn(),
		getCurrentScope: () => ({ setUser: jest.fn(), setTag: jest.fn() }),
	};
});

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-session';
process.env.INVITATION_STATE_SECRET = process.env.INVITATION_STATE_SECRET ?? 'a'.repeat(64);
process.env.DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// base64url 43 chars (32 bytes = 256-bit entropy)
const VALID_TOKEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm';
// 429（Throttler）は HttpStatus enum だが supertest の res.status は number。
// enum 直比較を避けるため number として扱う。
const HTTP_TOO_MANY_REQUESTS: number = HttpStatus.TOO_MANY_REQUESTS;

type MetricLog = { message: string };
const METRIC_KEYS = ['public_memo_read', 'memo_edit_read'];

/** console.log に積まれた構造化メトリクスログ（既知キーのみ）を抽出する。 */
const metricLogs = (spy: jest.SpyInstance): MetricLog[] =>
	spy.mock.calls
		.map((call) => call[0] as unknown)
		.filter((line): line is string => typeof line === 'string')
		.map((line) => {
			try {
				return JSON.parse(line) as { message?: unknown };
			} catch {
				return null;
			}
		})
		.filter(
			(obj): obj is MetricLog =>
				!!obj && typeof obj.message === 'string' && METRIC_KEYS.includes(obj.message),
		);

interface PrismaMocks {
	findFirst: jest.Mock;
	findMany: jest.Mock;
	userFindUnique: jest.Mock;
}

const createMocks = (): PrismaMocks => ({
	findFirst: jest.fn(),
	findMany: jest.fn(),
	userFindUnique: jest.fn(),
});

const buildPrismaMock = (mocks: PrismaMocks) => ({
	memo: {
		findFirst: mocks.findFirst,
		findUnique: jest.fn(),
		findMany: mocks.findMany,
		update: jest.fn(),
		delete: jest.fn(),
		deleteMany: jest.fn(),
		count: jest.fn(),
		create: jest.fn(),
	},
	user: { findUnique: mocks.userFindUnique },
	$connect: jest.fn(),
	$disconnect: jest.fn(),
	onModuleInit: jest.fn(),
	onModuleDestroy: jest.fn(),
});

// ─── Task 3.2: アクセス境界（本物のグローバル JWT Guard を維持） ───────────

describe('公開コントローラのアクセス境界 (Task 3.2)', () => {
	let app: INestApplication<App>;
	const mocks = createMocks();

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(PrismaService)
			.useValue(buildPrismaMock(mocks))
			.compile();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		mocks.findFirst.mockReset();
		mocks.findMany.mockReset();
		mocks.userFindUnique.mockReset();
	});

	it('@Public() により JWT なしで公開メモを取得できる', async () => {
		mocks.findFirst.mockResolvedValue({
			title: 'Public',
			content: '<p>hi</p>',
			updatedAt: new Date('2026-05-30T10:00:00.000Z'),
		});

		const res = await request(app.getHttpServer()).get(`/memos/public/${VALID_TOKEN}`);

		expect(res.status).toBe(HttpStatus.OK);
	});

	it.each([
		['GET /memos（一覧）', '/memos'],
		['GET /memos/me/public-memos（公開中一覧）', '/memos/me/public-memos'],
		['GET /memos/trash（ゴミ箱）', '/memos/trash'],
	])('公開経路以外の %s は JWT なしで 401（グローバル JWT Guard 維持）', async (_label, path) => {
		const res = await request(app.getHttpServer()).get(path);

		expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
		// 編集系ハンドラには到達せず DB アクセスも発生しない
		expect(mocks.findMany).not.toHaveBeenCalled();
	});

	it('公開メモ取得で Cache-Control: private, max-age=30, must-revalidate を維持する', async () => {
		mocks.findFirst.mockResolvedValue({
			title: 'Public',
			content: '<p>hi</p>',
			updatedAt: new Date('2026-05-30T10:00:00.000Z'),
		});

		const res = await request(app.getHttpServer()).get(`/memos/public/${VALID_TOKEN}`);

		expect(res.headers['cache-control']).toBe('private, max-age=30, must-revalidate');
	});

	it.each([
		['POST', 'post'],
		['PUT', 'put'],
		['PATCH', 'patch'],
		['DELETE', 'delete'],
	])(
		'公開経路は読み取り専用で %s /memos/public/:token を許可しない（認可バイパス新設なし）',
		async (_label, method) => {
			const res = await request(app.getHttpServer())
				[method as 'post'](`/memos/public/${VALID_TOKEN}`)
				.send({ title: 'hack', content: 'hack' });

			// GET 以外は公開経路に存在せず、編集系ハンドラへも解決されない（404）
			expect(res.status).toBe(HttpStatus.NOT_FOUND);
			// 公開経路を通じた書き込み系 DB 操作は発生しない
			expect(mocks.findFirst).not.toHaveBeenCalled();
		},
	);
});

// ─── Task 3.3 (part 1): 公開／編集のメトリクスキー分離（混線なし） ──────────

describe('メトリクスログの公開／編集分離 (Task 3.3)', () => {
	let app: INestApplication<App>;
	const mocks = createMocks();
	let logSpy: jest.SpyInstance;

	// 編集経路は本物の JWT Guard を通すため、実トークンを発行し user を mock 解決する。
	// JwtStrategy → AuthService.validateJwtPayload は payload.sub で user を検索する。
	const EDIT_USER = { id: 'user-1', email: 'user-1@example.com', name: 'Editor', role: 'USER' };
	const bearer = (): string =>
		`Bearer ${jwt.sign({ sub: EDIT_USER.id }, process.env.JWT_SECRET as string)}`;

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(PrismaService)
			.useValue(buildPrismaMock(mocks))
			.compile();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		mocks.findFirst.mockReset();
		mocks.findMany.mockReset();
		mocks.userFindUnique.mockReset();
		logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	it('公開経路は public_memo_read のみを発出し memo_edit_read を出さない', async () => {
		mocks.findFirst.mockResolvedValue({
			title: 'Public',
			content: '<p>hi</p>',
			updatedAt: new Date('2026-05-30T10:00:00.000Z'),
		});

		const res = await request(app.getHttpServer()).get(`/memos/public/${VALID_TOKEN}`);
		expect(res.status).toBe(HttpStatus.OK);

		const logs = metricLogs(logSpy);
		expect(logs.filter((l) => l.message === 'public_memo_read')).toHaveLength(1);
		expect(logs.filter((l) => l.message === 'memo_edit_read')).toHaveLength(0);
	});

	it('編集経路は memo_edit_read のみを発出し public_memo_read を出さない', async () => {
		// 実 JWT Guard を通すため user を解決し、編集一覧ハンドラに到達させる
		mocks.userFindUnique.mockResolvedValue(EDIT_USER);
		mocks.findMany.mockResolvedValue([]);

		const res = await request(app.getHttpServer()).get('/memos').set('Authorization', bearer());
		expect(res.status).toBe(HttpStatus.OK);

		const logs = metricLogs(logSpy);
		expect(logs.filter((l) => l.message === 'memo_edit_read')).toHaveLength(1);
		expect(logs.filter((l) => l.message === 'public_memo_read')).toHaveLength(0);
	});
});

// ─── Task 3.3 (part 2 & 3): レート制限と公開 req レート算出契約 ─────────────

describe('公開 req レートの算出（served + throttled） (Task 3.3)', () => {
	let app: INestApplication<App>;
	const mocks = createMocks();
	let logSpy: jest.SpyInstance;

	// 公開経路の @Throttle 上限（IP 60req/分）。この本数だけ送ると超過分が 429 になる。
	const PUBLIC_THROTTLE_LIMIT = 60;
	const TOTAL_REQUESTS = PUBLIC_THROTTLE_LIMIT + 5;

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(PrismaService)
			.useValue(buildPrismaMock(mocks))
			.compile();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		mocks.findFirst.mockReset();
		mocks.findFirst.mockResolvedValue({
			title: 'Public',
			content: '<p>hi</p>',
			updatedAt: new Date('2026-05-30T10:00:00.000Z'),
		});
		logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	it('レート制限超過で 429 が発火し、429 は public_memo_read に現れず、req レート = served + throttled で算出される', async () => {
		const statuses: number[] = [];
		// 同一 IP から逐次送信して throttle バケットを確実に消費する
		for (let i = 0; i < TOTAL_REQUESTS; i++) {
			const res = await request(app.getHttpServer()).get(`/memos/public/${VALID_TOKEN}`);
			statuses.push(res.status);
		}

		const served = statuses.filter((s) => s !== HTTP_TOO_MANY_REQUESTS).length;
		const throttled = statuses.filter((s) => s === HTTP_TOO_MANY_REQUESTS).length;

		// レート制限が確かに発火している（429 が存在する）
		expect(throttled).toBeGreaterThan(0);

		// 429 は Guard 段で弾かれ Interceptor に到達しないため、served 分だけが
		// public_memo_read として発出される（throttled は公開カウントに現れない）。
		const publicReadLogs = metricLogs(logSpy).filter((l) => l.message === 'public_memo_read');
		expect(publicReadLogs).toHaveLength(served);

		// 公開 req レート = served（Interceptor 到達分）+ throttled（429 別経路補完）の和。
		expect(served + throttled).toBe(TOTAL_REQUESTS);
	});
});

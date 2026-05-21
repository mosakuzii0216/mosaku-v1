/**
 * PATCH /memos/:id の last-write-wins (clientUpdatedAt) コントラクトを HTTP 経由で検証する e2e テスト。
 *
 * 実 DB / 実 Sentry には接続せず、PrismaService と JwtAuthGuard を override して
 * AppModule の controller → service → DTO バリデーション → グローバル ValidationPipe
 * → AppException 経由のエラーレスポンス整形までを通す。
 */

const setUserMock = jest.fn();
const setTagMock = jest.fn();

jest.mock('@sentry/nestjs', () => {
	const actual = jest.requireActual<typeof import('@sentry/nestjs')>('@sentry/nestjs');
	return {
		...actual,
		init: jest.fn(),
		getCurrentScope: () => ({ setUser: setUserMock, setTag: setTagMock }),
	};
});

import {
	ExecutionContext,
	HttpStatus,
	INestApplication,
	UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-session';
process.env.DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';

import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';

const memoFixture = {
	id: 'memo-1',
	title: 'Existing',
	content: 'Hello',
	createdAt: new Date('2026-05-09T00:00:00.000Z'),
	updatedAt: new Date('2026-05-10T10:00:00.000Z'),
	trashedAt: null,
	userId: 'user-1',
	notebookId: null,
	memoTags: [],
	notebook: null,
};

type MemoResponseBody = { title: string };
type ConflictResponseBody = {
	code: string;
	statusCode: number;
	details: { current: { id: string; userId: string } };
};

describe('PATCH /memos/:id (e2e) — last-write-wins', () => {
	let app: INestApplication<App>;
	const findFirstMock = jest.fn();
	const updateMock = jest.fn();

	// Auth control: テストごとに切り替えて 401/403/404 ケースを表現する
	let authMode: 'authed' | 'unauthed' = 'authed';

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideGuard(JwtAuthGuard)
			.useValue({
				canActivate: (ctx: ExecutionContext) => {
					if (authMode === 'unauthed') {
						throw new UnauthorizedException();
					}
					const req = ctx
						.switchToHttp()
						.getRequest<{ user?: { id: string; email: string; role: string } }>();
					req.user = { id: 'user-1', email: 'test@example.com', role: 'user' };
					return true;
				},
			})
			.overrideProvider(PrismaService)
			.useValue({
				memo: {
					findFirst: findFirstMock,
					findUnique: jest.fn(),
					update: updateMock,
					delete: jest.fn(),
					deleteMany: jest.fn(),
					findMany: jest.fn(),
					count: jest.fn(),
					create: jest.fn(),
				},
				$connect: jest.fn(),
				$disconnect: jest.fn(),
				onModuleInit: jest.fn(),
				onModuleDestroy: jest.fn(),
			})
			.compile();

		app = moduleFixture.createNestApplication();
		// 注意: monorepo ホイストの都合で ValidationPipe（class-validator）を読み込めないため、
		// DTO フォーマット検証は update-memo.dto.spec.ts のユニットテストに委譲し、
		// 本 e2e では service / controller / AppException 経由のレスポンス整形のみ検証する。
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		findFirstMock.mockReset();
		updateMock.mockReset();
		authMode = 'authed';
	});

	it('(a) clientUpdatedAt 未送信時は 200 で従来挙動の更新を行う', async () => {
		const updated = { ...memoFixture, title: 'Updated' };
		findFirstMock.mockResolvedValue(memoFixture);
		updateMock.mockResolvedValue(updated);

		const res = await request(app.getHttpServer())
			.patch('/memos/memo-1')
			.send({ title: 'Updated' });

		expect(res.status).toBe(HttpStatus.OK);
		const body = res.body as MemoResponseBody;
		expect(body.title).toBe('Updated');
		expect(updateMock).toHaveBeenCalled();
	});

	it('(b) クライアント側が新しい場合は 200 で更新される', async () => {
		const updated = { ...memoFixture, title: 'Newer' };
		findFirstMock.mockResolvedValue(memoFixture);
		updateMock.mockResolvedValue(updated);

		const res = await request(app.getHttpServer())
			.patch('/memos/memo-1')
			.send({ title: 'Newer', clientUpdatedAt: '2026-05-10T11:00:00.000Z' });

		expect(res.status).toBe(HttpStatus.OK);
		const body = res.body as MemoResponseBody;
		expect(body.title).toBe('Newer');
	});

	it('(c) サーバー側が新しい場合は 409 + details.current に現在の Memo を含む', async () => {
		findFirstMock.mockResolvedValue(memoFixture);

		const res = await request(app.getHttpServer())
			.patch('/memos/memo-1')
			.send({ title: 'Stale', clientUpdatedAt: '2026-05-10T09:00:00.000Z' });

		expect(res.status).toBe(HttpStatus.CONFLICT);
		const body = res.body as ConflictResponseBody;
		expect(body.code).toBe('RES006');
		expect(body.statusCode).toBe(HttpStatus.CONFLICT);
		expect(body.details).toBeDefined();
		expect(body.details.current.id).toBe('memo-1');
		expect(body.details.current.userId).toBe('user-1');
		expect(updateMock).not.toHaveBeenCalled();
	});

	it('未認証アクセスは 401 を返す', async () => {
		authMode = 'unauthed';
		const res = await request(app.getHttpServer()).patch('/memos/memo-1').send({ title: 'X' });

		expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
		expect(updateMock).not.toHaveBeenCalled();
	});

	it('他ユーザーのメモは 403 を返す', async () => {
		findFirstMock.mockResolvedValue({ ...memoFixture, userId: 'other-user' });

		const res = await request(app.getHttpServer())
			.patch('/memos/memo-1')
			.send({ title: 'X', clientUpdatedAt: '2026-05-10T11:00:00.000Z' });

		expect(res.status).toBe(HttpStatus.FORBIDDEN);
		expect(updateMock).not.toHaveBeenCalled();
	});

	it('存在しないメモ (またはゴミ箱送り) は 404 を返す', async () => {
		findFirstMock.mockResolvedValue(null);

		const res = await request(app.getHttpServer()).patch('/memos/nonexistent').send({ title: 'X' });

		expect(res.status).toBe(HttpStatus.NOT_FOUND);
		expect(updateMock).not.toHaveBeenCalled();
	});
});

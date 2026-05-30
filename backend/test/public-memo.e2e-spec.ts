/**
 * 未ログイン閲覧用の公開メモ API (GET /memos/public/:token) を HTTP 経由で検証する e2e テスト。
 *
 * - 未認証で 200 を返すこと (Req 3.1, 3.4)
 * - 存在しない / 無効化済み / ゴミ箱内は一律 404 (Req 3.3)
 * - Cache-Control ヘッダーが付与されること (Req 6.3)
 * - レスポンスに個人情報が含まれないこと (Req 3.2)
 * - トークンバリデーション違反で 400 (Req 4.1)
 */

const setUserMock = jest.fn();
const setTagMock = jest.fn();

jest.mock('@sentry/nestjs', () => {
	const actual = jest.requireActual<typeof import('@sentry/nestjs')>('@sentry/nestjs');
	return {
		...actual,
		init: jest.fn(),
		captureMessage: jest.fn(),
		captureException: jest.fn(),
		getCurrentScope: () => ({ setUser: setUserMock, setTag: setTagMock }),
	};
});

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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

describe('GET /memos/public/:token (e2e)', () => {
	let app: INestApplication<App>;

	const findFirstMock = jest.fn();
	const userFindUniqueMock = jest.fn();

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(PrismaService)
			.useValue({
				memo: {
					findFirst: findFirstMock,
					findUnique: jest.fn(),
					findMany: jest.fn(),
					update: jest.fn(),
					delete: jest.fn(),
					deleteMany: jest.fn(),
					count: jest.fn(),
					create: jest.fn(),
				},
				user: {
					findUnique: userFindUniqueMock,
				},
				$connect: jest.fn(),
				$disconnect: jest.fn(),
				onModuleInit: jest.fn(),
				onModuleDestroy: jest.fn(),
			})
			.compile();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		findFirstMock.mockReset();
		userFindUniqueMock.mockReset();
	});

	// ─── 成功ケース ────────────────────────────────────────────────────

	describe('成功ケース', () => {
		it('未認証リクエストで公開メモを 200 で返す (Req 3.1, 3.4)', async () => {
			const memo = {
				title: 'Test Memo',
				content: '<p>Hello World</p>',
				updatedAt: new Date('2026-05-30T10:00:00.000Z'),
			};
			findFirstMock.mockResolvedValue(memo);

			const res = await request(app.getHttpServer()).get(`/memos/public/${VALID_TOKEN}`);

			expect(res.status).toBe(HttpStatus.OK);
			expect(res.body).toEqual({
				title: 'Test Memo',
				content: '<p>Hello World</p>',
				updatedAt: '2026-05-30T10:00:00.000Z',
			});
		});

		it('Cache-Control: private, max-age=30, must-revalidate ヘッダーが付与される (Req 6.3)', async () => {
			findFirstMock.mockResolvedValue({
				title: 'Test Memo',
				content: '<p>Content</p>',
				updatedAt: new Date('2026-05-30T10:00:00.000Z'),
			});

			const res = await request(app.getHttpServer()).get(`/memos/public/${VALID_TOKEN}`);

			expect(res.status).toBe(HttpStatus.OK);
			expect(res.headers['cache-control']).toBe('private, max-age=30, must-revalidate');
		});

		it('Vary: Accept ヘッダーが付与される (Req 6.3 スモーク確認)', async () => {
			findFirstMock.mockResolvedValue({
				title: 'Test Memo',
				content: '<p>Content</p>',
				updatedAt: new Date('2026-05-30T10:00:00.000Z'),
			});

			const res = await request(app.getHttpServer()).get(`/memos/public/${VALID_TOKEN}`);

			expect(res.status).toBe(HttpStatus.OK);
			expect(res.headers['vary']).toContain('Accept');
		});

		it('レスポンスは title / content / updatedAt のみで個人情報を含まない (Req 3.2)', async () => {
			findFirstMock.mockResolvedValue({
				title: 'Test Memo',
				content: '<p>Content</p>',
				updatedAt: new Date('2026-05-30T10:00:00.000Z'),
			});

			const res = await request(app.getHttpServer()).get(`/memos/public/${VALID_TOKEN}`);

			expect(res.status).toBe(HttpStatus.OK);
			const keys = Object.keys(res.body as object);
			expect(keys).toEqual(expect.arrayContaining(['title', 'content', 'updatedAt']));
			expect(keys).not.toContain('userId');
			expect(keys).not.toContain('email');
			expect(keys).not.toContain('notebookId');
			expect(keys).not.toContain('publicToken');
			expect(keys).not.toContain('id');
		});

		it('findByToken が正しいトークンと trashedAt: null 条件でクエリを呼ぶ', async () => {
			findFirstMock.mockResolvedValue({
				title: 'Test',
				content: '',
				updatedAt: new Date(),
			});

			await request(app.getHttpServer()).get(`/memos/public/${VALID_TOKEN}`);

			expect(findFirstMock).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						publicToken: VALID_TOKEN,
						trashedAt: null,
					}),
				}),
			);
		});
	});

	// ─── 404 ケース ────────────────────────────────────────────────────

	describe('404 ケース — 存在しない/無効化済み/ゴミ箱内は一律 404 (Req 3.3)', () => {
		it('存在しないトークンで 404 を返す', async () => {
			findFirstMock.mockResolvedValue(null);

			const res = await request(app.getHttpServer()).get(`/memos/public/${VALID_TOKEN}`);

			expect(res.status).toBe(HttpStatus.NOT_FOUND);
		});

		it('ゴミ箱内メモ（trashedAt non-null）は findFirst で null が返り 404 になる', async () => {
			// trashedAt: null の条件で検索するため、ゴミ箱内メモはクエリ結果に含まれない
			findFirstMock.mockResolvedValue(null);

			const res = await request(app.getHttpServer()).get(`/memos/public/${VALID_TOKEN}`);

			expect(res.status).toBe(HttpStatus.NOT_FOUND);
		});
	});

	// ─── バリデーション ────────────────────────────────────────────────

	describe('トークンバリデーション', () => {
		it('トークンが短すぎる場合 (< 20 文字) は 400 を返す', async () => {
			const res = await request(app.getHttpServer()).get('/memos/public/tooshort');

			expect(res.status).toBe(HttpStatus.BAD_REQUEST);
			expect(findFirstMock).not.toHaveBeenCalled();
		});

		it('トークンが長すぎる場合 (> 64 文字) は 400 を返す', async () => {
			const longToken = 'A'.repeat(65);
			const res = await request(app.getHttpServer()).get(`/memos/public/${longToken}`);

			expect(res.status).toBe(HttpStatus.BAD_REQUEST);
			expect(findFirstMock).not.toHaveBeenCalled();
		});
	});
});

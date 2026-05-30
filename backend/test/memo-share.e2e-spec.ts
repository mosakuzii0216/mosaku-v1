/**
 * 所有者向け公開系 API（POST/DELETE /memos/:id/share, POST /memos/:id/share/regenerate,
 * GET /memos/me/public-memos）の認可・状態遷移・レスポンス整形を HTTP 経由で検証する e2e テスト。
 *
 * 実 DB / 実 Sentry には接続せず、PrismaService を override し JwtTokenService で
 * 実署名トークンを発行して AppModule の controller → service → AppException 経路を通す。
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

import { HttpStatus, INestApplication } from '@nestjs/common';
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
import { JwtTokenService } from '../src/auth/jwt.service';

const ownerUser = {
	id: 'user-owner',
	email: 'owner@example.com',
	name: 'Owner',
	role: 'USER' as const,
	password: null,
	createdAt: new Date('2026-01-01T00:00:00.000Z'),
	updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const otherUser = {
	id: 'user-other',
	email: 'other@example.com',
	name: 'Other',
	role: 'USER' as const,
	password: null,
	createdAt: new Date('2026-01-01T00:00:00.000Z'),
	updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const baseMemo = {
	id: 'memo-1',
	title: 'Shared Memo',
	content: '<p>hello</p>',
	createdAt: new Date('2026-05-01T00:00:00.000Z'),
	updatedAt: new Date('2026-05-10T10:00:00.000Z'),
	trashedAt: null,
	userId: ownerUser.id,
	notebookId: null,
	publicToken: null as string | null,
	publishedAt: null as Date | null,
};

type PublishResponse = { memoId: string; publicToken: string; publishedAt: string };
type ListResponse = Array<{
	memoId: string;
	title: string;
	publicToken: string;
	publishedAt: string;
	updatedAt: string;
}>;

describe('所有者向け公開系 API (e2e)', () => {
	let app: INestApplication<App>;
	let ownerAuth: string;
	let otherAuth: string;

	const findFirstMock = jest.fn();
	const findManyMock = jest.fn();
	const updateMock = jest.fn();
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
					findMany: findManyMock,
					update: updateMock,
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
		await app.init();

		const jwtTokenService = moduleFixture.get(JwtTokenService);
		ownerAuth = `Bearer ${jwtTokenService.generateTokens(ownerUser.id, ownerUser.email, ownerUser.role).accessToken}`;
		otherAuth = `Bearer ${jwtTokenService.generateTokens(otherUser.id, otherUser.email, otherUser.role).accessToken}`;
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		findFirstMock.mockReset();
		findManyMock.mockReset();
		updateMock.mockReset();
		userFindUniqueMock.mockReset();
		userFindUniqueMock.mockImplementation(({ where }: { where: { id: string } }) => {
			if (where.id === ownerUser.id) return Promise.resolve(ownerUser);
			if (where.id === otherUser.id) return Promise.resolve(otherUser);
			return Promise.resolve(null);
		});
	});

	// ─── Authorization ──────────────────────────────────────────────────

	describe('認可', () => {
		it('所有者でないユーザーが publish すると 403 を返す', async () => {
			findFirstMock.mockResolvedValue({ ...baseMemo });

			const res = await request(app.getHttpServer())
				.post('/memos/memo-1/share')
				.set('Authorization', otherAuth);

			expect(res.status).toBe(HttpStatus.FORBIDDEN);
			expect(updateMock).not.toHaveBeenCalled();
		});

		it('所有者でないユーザーが unpublish すると 403 を返す', async () => {
			findFirstMock.mockResolvedValue({
				...baseMemo,
				publicToken: 'tok-existing',
				publishedAt: new Date('2026-05-20T00:00:00.000Z'),
			});

			const res = await request(app.getHttpServer())
				.delete('/memos/memo-1/share')
				.set('Authorization', otherAuth);

			expect(res.status).toBe(HttpStatus.FORBIDDEN);
			expect(updateMock).not.toHaveBeenCalled();
		});

		it('所有者でないユーザーが regenerate すると 403 を返す', async () => {
			findFirstMock.mockResolvedValue({
				...baseMemo,
				publicToken: 'tok-existing',
				publishedAt: new Date('2026-05-20T00:00:00.000Z'),
			});

			const res = await request(app.getHttpServer())
				.post('/memos/memo-1/share/regenerate')
				.set('Authorization', otherAuth);

			expect(res.status).toBe(HttpStatus.FORBIDDEN);
			expect(updateMock).not.toHaveBeenCalled();
		});

		it('未認証アクセス（Authorization ヘッダなし）は 401 を返す', async () => {
			const res = await request(app.getHttpServer()).post('/memos/memo-1/share');

			expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
			expect(updateMock).not.toHaveBeenCalled();
		});
	});

	// ─── Lifecycle ──────────────────────────────────────────────────────

	describe('公開→非公開→再公開→再生成のライフサイクル', () => {
		it('期待どおりに状態を変える', async () => {
			// (1) Publish
			findFirstMock.mockResolvedValueOnce({ ...baseMemo });
			const publishedAt1 = new Date('2026-05-30T10:00:00.000Z');
			updateMock.mockImplementationOnce(({ data }: { data: { publicToken: string } }) =>
				Promise.resolve({
					id: 'memo-1',
					publicToken: data.publicToken,
					publishedAt: publishedAt1,
				}),
			);

			const publishRes = await request(app.getHttpServer())
				.post('/memos/memo-1/share')
				.set('Authorization', ownerAuth);

			expect(publishRes.status).toBe(HttpStatus.CREATED);
			const publishBody = publishRes.body as PublishResponse;
			expect(publishBody.memoId).toBe('memo-1');
			expect(publishBody.publicToken).toMatch(/^[A-Za-z0-9_-]+$/);
			expect(publishBody.publishedAt).toBe(publishedAt1.toISOString());

			const tokenAfterPublish = publishBody.publicToken;

			// (2) Unpublish
			findFirstMock.mockResolvedValueOnce({
				...baseMemo,
				publicToken: tokenAfterPublish,
				publishedAt: publishedAt1,
			});
			updateMock.mockResolvedValueOnce({});

			const unpublishRes = await request(app.getHttpServer())
				.delete('/memos/memo-1/share')
				.set('Authorization', ownerAuth);

			expect(unpublishRes.status).toBe(HttpStatus.OK);
			expect(unpublishRes.body).toEqual({ success: true });
			expect(updateMock).toHaveBeenLastCalledWith(
				expect.objectContaining({
					where: { id: 'memo-1' },
					data: { publicToken: null, publishedAt: null },
				}),
			);

			// (3) Re-publish
			findFirstMock.mockResolvedValueOnce({ ...baseMemo });
			const publishedAt2 = new Date('2026-05-30T11:00:00.000Z');
			updateMock.mockImplementationOnce(({ data }: { data: { publicToken: string } }) =>
				Promise.resolve({
					id: 'memo-1',
					publicToken: data.publicToken,
					publishedAt: publishedAt2,
				}),
			);

			const repubRes = await request(app.getHttpServer())
				.post('/memos/memo-1/share')
				.set('Authorization', ownerAuth);

			expect(repubRes.status).toBe(HttpStatus.CREATED);
			const repubBody = repubRes.body as PublishResponse;
			expect(repubBody.publicToken).not.toBe(tokenAfterPublish);

			const tokenAfterRepub = repubBody.publicToken;

			// (4) Regenerate
			findFirstMock.mockResolvedValueOnce({
				...baseMemo,
				publicToken: tokenAfterRepub,
				publishedAt: publishedAt2,
			});
			const publishedAt3 = new Date('2026-05-30T12:00:00.000Z');
			updateMock.mockImplementationOnce(({ data }: { data: { publicToken: string } }) =>
				Promise.resolve({
					id: 'memo-1',
					publicToken: data.publicToken,
					publishedAt: publishedAt3,
				}),
			);

			const regenRes = await request(app.getHttpServer())
				.post('/memos/memo-1/share/regenerate')
				.set('Authorization', ownerAuth);

			expect(regenRes.status).toBe(HttpStatus.CREATED);
			const regenBody = regenRes.body as PublishResponse;
			expect(regenBody.publicToken).not.toBe(tokenAfterRepub);
			expect(regenBody.publishedAt).toBe(publishedAt3.toISOString());
		});
	});

	// ─── List my public memos ──────────────────────────────────────────

	describe('GET /memos/me/public-memos', () => {
		it('公開日時の降順で返り、DTO に個人情報を含まない', async () => {
			const fixtures = [
				{
					id: 'memo-2',
					title: 'Memo 2',
					publicToken: 'tok2',
					publishedAt: new Date('2026-05-30T10:00:00.000Z'),
					updatedAt: new Date('2026-05-30T10:00:00.000Z'),
				},
				{
					id: 'memo-1',
					title: 'Memo 1',
					publicToken: 'tok1',
					publishedAt: new Date('2026-05-29T10:00:00.000Z'),
					updatedAt: new Date('2026-05-29T10:00:00.000Z'),
				},
			];
			findManyMock.mockResolvedValue(fixtures);

			const res = await request(app.getHttpServer())
				.get('/memos/me/public-memos')
				.set('Authorization', ownerAuth);

			expect(res.status).toBe(HttpStatus.OK);

			expect(findManyMock).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						userId: ownerUser.id,
						trashedAt: null,
						publicToken: { not: null },
					}),
					orderBy: { publishedAt: 'desc' },
				}),
			);

			const body = res.body as ListResponse;
			expect(body).toHaveLength(2);
			expect(body[0].memoId).toBe('memo-2');
			expect(body[1].memoId).toBe('memo-1');

			for (const item of body) {
				expect(Object.keys(item).sort()).toEqual(
					['memoId', 'publicToken', 'publishedAt', 'title', 'updatedAt'].sort(),
				);
				expect(item).not.toHaveProperty('userId');
				expect(item).not.toHaveProperty('email');
				expect(item).not.toHaveProperty('notebookId');
			}
		});

		it('未認証では 401 を返す', async () => {
			const res = await request(app.getHttpServer()).get('/memos/me/public-memos');

			expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
			expect(findManyMock).not.toHaveBeenCalled();
		});
	});
});

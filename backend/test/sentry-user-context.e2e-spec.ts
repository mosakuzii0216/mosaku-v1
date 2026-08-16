/**
 * SentryUserContextInterceptor のグローバル登録挙動を HTTP 経由で検証する e2e テスト。
 *
 * - 認証済みエンドポイント (`/memos`) → req.user.id を Sentry scope に setUser する
 * - 公開エンドポイント (`/invitation/verify`) → setUser を呼ばず scope を匿名のまま維持する
 *
 * 実 DB / 実 Sentry に接続せず、@sentry/nestjs の getCurrentScope のみ spy 化し、
 * 各サービスは Test.createTestingModule の overrideProvider で no-op に差し替える。
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

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

// JWT_SECRET / SESSION_SECRET / DATABASE_URL は ConfigService getter が throw するので
// テスト前に最低限の値を埋めておく
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-session';
process.env.INVITATION_STATE_SECRET = process.env.INVITATION_STATE_SECRET ?? 'a'.repeat(64);
process.env.DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';

import { AppModule } from '../src/app.module';
import { MemoService } from '../src/memo/memo.service';
import { InvitationService } from '../src/invitation/invitation.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtTokenService } from '../src/auth/jwt.service';

describe('SentryUserContextInterceptor (e2e)', () => {
	let app: INestApplication<App>;
	let authedHeader: string;

	const authedUser = {
		id: 'user-test-123',
		email: 'sentry-user@example.com',
		name: 'Sentry User',
		role: 'USER' as const,
		password: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
	};

	const userFindUniqueMock = jest.fn();

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(MemoService)
			.useValue({
				findAll: jest.fn().mockResolvedValue([]),
				findAllPaginated: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
			})
			.overrideProvider(InvitationService)
			.useValue({
				verifyInvitation: jest.fn().mockResolvedValue({ valid: true }),
				findValidInvitation: jest.fn().mockResolvedValue({
					id: 'inv-stub',
					code: 'STUB000001',
					maxUses: 1,
					usedCount: 0,
					expiresAt: null,
					createdAt: new Date(),
					createdById: 'user-stub',
				}),
				useInvitation: jest.fn().mockResolvedValue(undefined),
			})
			.overrideProvider(PrismaService)
			.useValue({
				// JwtStrategy.validate → AuthService.validateJwtPayload で user を引くため
				user: { findUnique: userFindUniqueMock },
				$connect: jest.fn(),
				$disconnect: jest.fn(),
				onModuleInit: jest.fn(),
				onModuleDestroy: jest.fn(),
			})
			.compile();

		app = moduleFixture.createNestApplication();
		await app.init();

		// `.overrideGuard(JwtAuthGuard)` は APP_GUARD 登録された JwtAuthGuard には効かないため、
		// 実 JwtTokenService で署名済み JWT を発行して Authorization ヘッダで通す。
		const jwtTokenService = moduleFixture.get(JwtTokenService);
		const { accessToken } = jwtTokenService.generateTokens(
			authedUser.id,
			authedUser.email,
			authedUser.role,
		);
		authedHeader = `Bearer ${accessToken}`;
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		setUserMock.mockClear();
		setTagMock.mockClear();
		userFindUniqueMock.mockReset();
		userFindUniqueMock.mockResolvedValue(authedUser);
	});

	it('認証済み /memos リクエストで Sentry scope に { id: userId } のみが設定されること', async () => {
		await request(app.getHttpServer()).get('/memos').set('Authorization', authedHeader).expect(200);

		expect(setUserMock).toHaveBeenCalledTimes(1);
		expect(setUserMock).toHaveBeenCalledWith({ id: 'user-test-123' });
	});

	it('公開 /invitation/verify リクエストでは setUser を呼ばず scope を匿名のまま維持すること', async () => {
		await request(app.getHttpServer())
			.post('/invitation/verify')
			.send({ code: 'TEST-CODE-1234' })
			.expect((res) => {
				// 200/201 のいずれかで応答すれば良い（mock の戻り値次第）
				expect([200, 201]).toContain(res.status);
			});

		expect(setUserMock).not.toHaveBeenCalled();
	});
});

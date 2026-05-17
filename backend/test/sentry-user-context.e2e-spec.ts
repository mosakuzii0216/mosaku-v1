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

import { INestApplication, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';

// JWT_SECRET / SESSION_SECRET / DATABASE_URL は ConfigService getter が throw するので
// テスト前に最低限の値を埋めておく
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-session';
process.env.DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';

import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { MemoService } from '../src/memo/memo.service';
import { InvitationService } from '../src/invitation/invitation.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('SentryUserContextInterceptor (e2e)', () => {
	let app: INestApplication<App>;

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideGuard(JwtAuthGuard)
			.useValue({
				canActivate: (ctx: ExecutionContext) => {
					const req = ctx.switchToHttp().getRequest<{ user: { id: string } }>();
					req.user = { id: 'user-test-123' };
					return true;
				},
			})
			.overrideProvider(MemoService)
			.useValue({
				findAll: jest.fn().mockResolvedValue([]),
				findAllPaginated: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
			})
			.overrideProvider(InvitationService)
			.useValue({
				verifyInvitation: jest.fn().mockResolvedValue({ valid: true }),
			})
			.overrideProvider(PrismaService)
			.useValue({
				$connect: jest.fn(),
				$disconnect: jest.fn(),
				onModuleInit: jest.fn(),
				onModuleDestroy: jest.fn(),
			})
			.compile();

		app = moduleFixture.createNestApplication();
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		setUserMock.mockClear();
		setTagMock.mockClear();
	});

	it('認証済み /memos リクエストで Sentry scope に { id: userId } のみが設定されること', async () => {
		await request(app.getHttpServer()).get('/memos').expect(200);

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

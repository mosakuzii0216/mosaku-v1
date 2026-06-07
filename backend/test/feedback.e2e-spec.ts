/**
 * POST /feedback エンドポイントの統合テスト。
 *
 * 実 DB には接続せず PrismaService を override し、JwtTokenService で
 * 実署名トークンを発行して AppModule の controller → service 経路を通す。
 * Slack fetch と Sentry はモックし外部依存を排除する。
 */

jest.mock('@sentry/nestjs', () => ({
	init: jest.fn(),
	captureException: jest.fn(),
	captureMessage: jest.fn(),
	getCurrentScope: () => ({ setUser: jest.fn(), setTag: jest.fn() }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-session';
process.env.INVITATION_STATE_SECRET = process.env.INVITATION_STATE_SECRET ?? 'a'.repeat(64);
process.env.DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.SLACK_FEEDBACK_WEBHOOK_URL = 'https://hooks.slack.com/services/test';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtTokenService } from '../src/auth/jwt.service';

const testUser = {
	id: 'user-feedback-test',
	email: 'feedback@example.com',
	name: '喜多川海夢',
	role: 'USER' as const,
	password: null,
	createdAt: new Date('2026-01-01T00:00:00.000Z'),
	updatedAt: new Date('2026-01-01T00:00:00.000Z'),
	emailVerificationToken: null,
	emailVerified: true,
	resetPasswordExpires: null,
	resetPasswordToken: null,
	oauthId: null,
	lineId: null,
	appleId: null,
	xId: null,
};

describe('POST /feedback (e2e)', () => {
	let app: INestApplication<App>;
	let userAuth: string;
	const userFindUniqueMock = jest.fn();

	beforeAll(async () => {
		mockFetch.mockResolvedValue({ ok: true, status: 200 });

		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(ThrottlerStorage)
			.useValue({
				increment: () =>
					Promise.resolve({
						totalHits: 1,
						timeToExpire: 60,
						isBlocked: false,
						timeToBlockExpire: 0,
					}),
			})
			.overrideProvider(PrismaService)
			.useValue({
				user: {
					findUnique: userFindUniqueMock,
				},
				memo: {
					findFirst: jest.fn(),
					findUnique: jest.fn(),
					findMany: jest.fn(),
					update: jest.fn(),
					delete: jest.fn(),
					deleteMany: jest.fn(),
					count: jest.fn(),
					create: jest.fn(),
				},
				notebook: {
					findFirst: jest.fn(),
					findUnique: jest.fn(),
					findMany: jest.fn(),
					update: jest.fn(),
					delete: jest.fn(),
					create: jest.fn(),
					count: jest.fn(),
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

		const jwtTokenService = moduleFixture.get(JwtTokenService);
		userAuth = `Bearer ${jwtTokenService.generateTokens(testUser.id, testUser.email, testUser.role).accessToken}`;
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		jest.clearAllMocks();
		mockFetch.mockResolvedValue({ ok: true, status: 200 });
		userFindUniqueMock.mockImplementation(({ where }: { where: { id: string } }) => {
			if (where.id === testUser.id) return Promise.resolve(testUser);
			return Promise.resolve(null);
		});
	});

	describe('認証', () => {
		it('未認証リクエストは 401 を返す', async () => {
			const res = await request(app.getHttpServer())
				.post('/feedback')
				.send({ category: 'bug', message: 'テストバグです' });

			expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
		});
	});

	describe('正常系', () => {
		it('有効な JWT + 正常ペイロードで 201 を返す', async () => {
			const res = await request(app.getHttpServer())
				.post('/feedback')
				.set('Authorization', userAuth)
				.send({ category: 'bug', message: 'テストバグです' });

			expect(res.status).toBe(HttpStatus.CREATED);
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('improvement カテゴリで 201 を返す', async () => {
			const res = await request(app.getHttpServer())
				.post('/feedback')
				.set('Authorization', userAuth)
				.send({ category: 'improvement', message: '改善要望です' });

			expect(res.status).toBe(HttpStatus.CREATED);
		});

		it('other カテゴリで 201 を返す', async () => {
			const res = await request(app.getHttpServer())
				.post('/feedback')
				.set('Authorization', userAuth)
				.send({ category: 'other', message: 'その他のフィードバック' });

			expect(res.status).toBe(HttpStatus.CREATED);
		});

		it('Slack が失敗してもクライアントには 201 を返す', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Slack is down'));

			const res = await request(app.getHttpServer())
				.post('/feedback')
				.set('Authorization', userAuth)
				.send({ category: 'bug', message: 'Slack 障害中のテスト' });

			expect(res.status).toBe(HttpStatus.CREATED);
		});
	});

	describe('バリデーション', () => {
		it('無効なカテゴリで 400 を返す', async () => {
			const res = await request(app.getHttpServer())
				.post('/feedback')
				.set('Authorization', userAuth)
				.send({ category: 'invalid', message: 'テスト' });

			expect(res.status).toBe(HttpStatus.BAD_REQUEST);
		});

		it('メッセージ空で 400 を返す', async () => {
			const res = await request(app.getHttpServer())
				.post('/feedback')
				.set('Authorization', userAuth)
				.send({ category: 'bug', message: '' });

			expect(res.status).toBe(HttpStatus.BAD_REQUEST);
		});

		it('1001 文字メッセージで 400 を返す', async () => {
			const res = await request(app.getHttpServer())
				.post('/feedback')
				.set('Authorization', userAuth)
				.send({ category: 'bug', message: 'a'.repeat(1001) });

			expect(res.status).toBe(HttpStatus.BAD_REQUEST);
		});

		it('category フィールドなしで 400 を返す', async () => {
			const res = await request(app.getHttpServer())
				.post('/feedback')
				.set('Authorization', userAuth)
				.send({ message: 'カテゴリなし' });

			expect(res.status).toBe(HttpStatus.BAD_REQUEST);
		});
	});
});

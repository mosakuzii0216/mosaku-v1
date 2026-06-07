/**
 * `/auth/refresh` `/auth/logout` の HTTP 経路 e2e テスト。
 *
 * 実 DB / 実 Sentry には接続せず、PrismaService を override し、@sentry/nestjs を
 * jest.mock することで Refresh Token のローテーション / 再使用検知 / revoke / Cookie 発行を
 * AppModule の Controller → Guard → Service → Repository まで通して検証する。
 */

const sentryCaptureMessageMock = jest.fn();
const setUserMock = jest.fn();
const setTagMock = jest.fn();

jest.mock('@sentry/nestjs', () => {
	const actual = jest.requireActual<typeof import('@sentry/nestjs')>('@sentry/nestjs');
	return {
		...actual,
		init: jest.fn(),
		captureMessage: sentryCaptureMessageMock,
		captureException: jest.fn(),
		getCurrentScope: () => ({ setUser: setUserMock, setTag: setTagMock }),
	};
});

import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createHmac } from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as () => (
	req: unknown,
	res: unknown,
	next: () => void,
) => void;

// E2E 用の env を AppModule ロード前に固定する
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.REFRESH_TOKEN_PEPPER = 'test-pepper';
process.env.DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.CORS_ORIGINS = 'https://app.test,http://localhost:5173';
process.env.REFRESH_COOKIE_SAMESITE = 'lax';
process.env.REFRESH_COOKIE_SECURE = 'false';
delete process.env.REFRESH_COOKIE_DOMAIN;

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const ORIGIN = 'https://app.test';
const PEPPER = 'test-pepper';

const hash = (plain: string): string => createHmac('sha256', PEPPER).update(plain).digest('hex');

const userFixture = {
	id: 'user-1',
	email: 'user@example.com',
	name: 'Test User',
	password: null as string | null,
	role: 'USER' as const,
	createdAt: new Date('2026-01-01T00:00:00.000Z'),
	updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const buildRtRecord = (overrides: Partial<Record<string, unknown>> = {}) => ({
	id: 'rt-1',
	userId: 'user-1',
	tokenHash: hash('active-plain-rt'),
	familyId: '11111111-1111-1111-1111-111111111111',
	status: 'active' as 'active' | 'rotated' | 'revoked',
	issuedAt: new Date('2026-05-01T00:00:00.000Z'),
	expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
	lastUsedAt: null as Date | null,
	ip: null as string | null,
	userAgent: null as string | null,
	...overrides,
});

type RtRecord = ReturnType<typeof buildRtRecord>;

describe('POST /auth/refresh, /auth/logout (e2e)', () => {
	let app: INestApplication<App>;

	// Prisma refreshToken mocks
	const refreshTokenStore = new Map<string, RtRecord>();
	const refreshTokenFindUnique = jest.fn();
	const refreshTokenCreate = jest.fn();
	const refreshTokenUpdateMany = jest.fn();
	const refreshTokenDeleteMany = jest.fn();

	const userFindUnique = jest.fn();

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(PrismaService)
			.useValue({
				refreshToken: {
					findUnique: refreshTokenFindUnique,
					create: refreshTokenCreate,
					updateMany: refreshTokenUpdateMany,
					deleteMany: refreshTokenDeleteMany,
				},
				user: {
					findUnique: userFindUnique,
				},
				$transaction: async (cb: (tx: unknown) => unknown) =>
					cb({
						refreshToken: {
							findUnique: refreshTokenFindUnique,
							create: refreshTokenCreate,
							updateMany: refreshTokenUpdateMany,
						},
					}),
				$connect: jest.fn(),
				$disconnect: jest.fn(),
				onModuleInit: jest.fn(),
				onModuleDestroy: jest.fn(),
			})
			.compile();

		app = moduleFixture.createNestApplication();
		// main.ts と同じく cookie-parser を有効化
		app.use(cookieParser());
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		refreshTokenStore.clear();
		refreshTokenFindUnique.mockReset();
		refreshTokenCreate.mockReset();
		refreshTokenUpdateMany.mockReset();
		refreshTokenDeleteMany.mockReset();
		userFindUnique.mockReset();
		sentryCaptureMessageMock.mockReset();

		// Default: findUnique looks up by tokenHash from the in-memory store
		refreshTokenFindUnique.mockImplementation(
			(args: { where: { tokenHash?: string; id?: string } }) => {
				if (args.where.tokenHash) {
					return Promise.resolve(refreshTokenStore.get(args.where.tokenHash) ?? null);
				}
				if (args.where.id) {
					const match = Array.from(refreshTokenStore.values()).find((r) => r.id === args.where.id);
					return Promise.resolve(match ?? null);
				}
				return Promise.resolve(null);
			},
		);

		// Default: create stores by tokenHash and returns the record
		refreshTokenCreate.mockImplementation((args: { data: Omit<RtRecord, 'id' | 'lastUsedAt'> }) => {
			const record: RtRecord = {
				...args.data,
				id: `rt-new-${refreshTokenStore.size + 1}`,
				lastUsedAt: null,
			};
			refreshTokenStore.set(record.tokenHash, record);
			return Promise.resolve(record);
		});

		// Default: updateMany updates matching records in the store
		refreshTokenUpdateMany.mockImplementation(
			(args: { where: Record<string, unknown>; data: Partial<RtRecord> }) => {
				let count = 0;
				const where = args.where;
				for (const record of refreshTokenStore.values()) {
					if (where.id && record.id !== where.id) continue;
					if (where.familyId && record.familyId !== where.familyId) continue;
					if (where.userId && record.userId !== where.userId) continue;
					const statusFilter = where.status as { in?: string[] } | string | undefined;
					if (typeof statusFilter === 'string' && record.status !== statusFilter) continue;
					if (statusFilter && typeof statusFilter === 'object' && statusFilter.in) {
						if (!statusFilter.in.includes(record.status)) continue;
					}
					Object.assign(record, args.data);
					count++;
				}
				return Promise.resolve({ count });
			},
		);

		userFindUnique.mockResolvedValue({ ...userFixture });
	});

	describe('POST /auth/refresh', () => {
		it('Cookie 不在時は 401 AUTH010 を返す', async () => {
			const res = await request(app.getHttpServer())
				.post('/auth/refresh')
				.set('Origin', ORIGIN)
				.set('X-Refresh-Request', '1');

			expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
			expect(res.body).toMatchObject({ code: 'AUTH010' });
		});

		it('有効な RT で 200 + 新 Access Token + 新 Set-Cookie を返す', async () => {
			refreshTokenStore.set(hash('active-plain-rt'), buildRtRecord());

			const res = await request(app.getHttpServer())
				.post('/auth/refresh')
				.set('Origin', ORIGIN)
				.set('X-Refresh-Request', '1')
				.set('Cookie', 'refresh_token=active-plain-rt');

			expect(res.status).toBe(HttpStatus.OK);
			const body = res.body as { accessToken: string; user: { id: string } };
			expect(typeof body.accessToken).toBe('string');
			expect(body.accessToken.length).toBeGreaterThan(20);
			expect(body.user.id).toBe('user-1');

			// 新 Set-Cookie に refresh_token が含まれ、HttpOnly / Path=/auth / SameSite=Lax の属性を持つ
			const cookies = res.get('Set-Cookie') ?? [];
			const cookieHeader = (Array.isArray(cookies) ? cookies : [cookies]).join(';');
			expect(cookieHeader).toMatch(/refresh_token=/);
			expect(cookieHeader).toMatch(/HttpOnly/i);
			expect(cookieHeader).toMatch(/Path=\/auth/);
			expect(cookieHeader).toMatch(/SameSite=Lax/i);

			// 平文 RT は body に絶対乗らない
			expect(JSON.stringify(body)).not.toMatch(/refresh_token/i);

			// Sentry に refresh_token_rotated 発火
			const events = sentryCaptureMessageMock.mock.calls.map((c) => c[0] as string);
			expect(events).toContain('refresh_token_rotated');

			// markRotated (status=active → rotated) のための updateMany 呼び出しを確認
			expect(refreshTokenUpdateMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ status: 'active' }),
					data: expect.objectContaining({ status: 'rotated' }),
				}),
			);
		});

		it('revoked な RT は 401 AUTH011 を返す', async () => {
			refreshTokenStore.set(hash('revoked-rt'), buildRtRecord({ status: 'revoked' }));

			const res = await request(app.getHttpServer())
				.post('/auth/refresh')
				.set('Origin', ORIGIN)
				.set('X-Refresh-Request', '1')
				.set('Cookie', 'refresh_token=revoked-rt');

			expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
			expect(res.body).toMatchObject({ code: 'AUTH011' });
		});

		it('expired な RT は 401 AUTH013 を返す', async () => {
			refreshTokenStore.set(
				hash('expired-rt'),
				buildRtRecord({ expiresAt: new Date(Date.now() - 1000) }),
			);

			const res = await request(app.getHttpServer())
				.post('/auth/refresh')
				.set('Origin', ORIGIN)
				.set('X-Refresh-Request', '1')
				.set('Cookie', 'refresh_token=expired-rt');

			expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
			expect(res.body).toMatchObject({ code: 'AUTH013' });
		});

		it('rotated 状態の RT 再使用で family 全 revoke + Sentry warning + 401 AUTH012', async () => {
			const familyId = '22222222-2222-2222-2222-222222222222';
			refreshTokenStore.set(
				hash('rotated-rt'),
				buildRtRecord({ id: 'rt-parent', status: 'rotated', familyId }),
			);
			refreshTokenStore.set(
				hash('child-rt'),
				buildRtRecord({
					id: 'rt-child',
					tokenHash: hash('child-rt'),
					status: 'active',
					familyId,
				}),
			);

			const res = await request(app.getHttpServer())
				.post('/auth/refresh')
				.set('Origin', ORIGIN)
				.set('X-Refresh-Request', '1')
				.set('Cookie', 'refresh_token=rotated-rt');

			expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
			expect(res.body).toMatchObject({ code: 'AUTH012' });

			// family 全 revoke が走り、child も revoked 状態に
			const child = refreshTokenStore.get(hash('child-rt'));
			expect(child?.status).toBe('revoked');

			const events = sentryCaptureMessageMock.mock.calls.map((c) => c[0] as string);
			expect(events).toContain('refresh_token_reuse_detected');
			const reuseCall = sentryCaptureMessageMock.mock.calls.find(
				(c) => c[0] === 'refresh_token_reuse_detected',
			);
			expect(reuseCall?.[1]).toMatchObject({
				level: 'warning',
				tags: expect.objectContaining({ feature_area: 'auth' }),
			});
		});

		it('Origin ヘッダが許可外の場合は 403', async () => {
			const res = await request(app.getHttpServer())
				.post('/auth/refresh')
				.set('Origin', 'https://attacker.example')
				.set('X-Refresh-Request', '1')
				.set('Cookie', 'refresh_token=active-plain-rt');

			expect(res.status).toBe(HttpStatus.FORBIDDEN);
		});

		it('X-Refresh-Request ヘッダ欠如で 403', async () => {
			const res = await request(app.getHttpServer())
				.post('/auth/refresh')
				.set('Origin', ORIGIN)
				.set('Cookie', 'refresh_token=active-plain-rt');

			expect(res.status).toBe(HttpStatus.FORBIDDEN);
		});

		it('localhost dev Origin も corsOrigins から正常許可される', async () => {
			refreshTokenStore.set(hash('dev-rt'), buildRtRecord({ tokenHash: hash('dev-rt') }));

			const res = await request(app.getHttpServer())
				.post('/auth/refresh')
				.set('Origin', 'http://localhost:5173')
				.set('X-Refresh-Request', '1')
				.set('Cookie', 'refresh_token=dev-rt');

			expect(res.status).toBe(HttpStatus.OK);
		});
	});

	describe('POST /auth/logout', () => {
		it('Cookie あり: 該当 RT を revoked にして clearCookie を返す', async () => {
			const record = buildRtRecord({ tokenHash: hash('logout-rt') });
			refreshTokenStore.set(hash('logout-rt'), record);

			const res = await request(app.getHttpServer())
				.post('/auth/logout')
				.set('Origin', ORIGIN)
				.set('X-Refresh-Request', '1')
				.set('Cookie', 'refresh_token=logout-rt');

			expect(res.status).toBe(HttpStatus.OK);
			expect(res.body).toMatchObject({ message: 'Logout successful' });

			expect(record.status).toBe('revoked');

			const cookies = res.get('Set-Cookie') ?? [];
			const cookieHeader = (Array.isArray(cookies) ? cookies : [cookies]).join(';');
			expect(cookieHeader).toMatch(/refresh_token=;/);
			expect(cookieHeader).toMatch(/Path=\/auth/);

			const events = sentryCaptureMessageMock.mock.calls.map((c) => c[0] as string);
			expect(events).toContain('refresh_token_revoked');
		});

		it('Cookie 不在でも 200 を返し clearCookie を実行する', async () => {
			const res = await request(app.getHttpServer())
				.post('/auth/logout')
				.set('Origin', ORIGIN)
				.set('X-Refresh-Request', '1');

			expect(res.status).toBe(HttpStatus.OK);
			expect(res.body).toMatchObject({ message: 'Logout successful' });

			const cookies = res.get('Set-Cookie') ?? [];
			const cookieHeader = (Array.isArray(cookies) ? cookies : [cookies]).join(';');
			expect(cookieHeader).toMatch(/refresh_token=;/);
		});

		it('logout 直後に同じ RT で /auth/refresh すると 401 AUTH011 になる', async () => {
			const record = buildRtRecord({ tokenHash: hash('seq-rt') });
			refreshTokenStore.set(hash('seq-rt'), record);

			await request(app.getHttpServer())
				.post('/auth/logout')
				.set('Origin', ORIGIN)
				.set('X-Refresh-Request', '1')
				.set('Cookie', 'refresh_token=seq-rt');

			const res = await request(app.getHttpServer())
				.post('/auth/refresh')
				.set('Origin', ORIGIN)
				.set('X-Refresh-Request', '1')
				.set('Cookie', 'refresh_token=seq-rt');

			expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
			expect(res.body).toMatchObject({ code: 'AUTH011' });
		});

		it('Origin 不一致は 403', async () => {
			const res = await request(app.getHttpServer())
				.post('/auth/logout')
				.set('Origin', 'https://attacker.example')
				.set('X-Refresh-Request', '1');

			expect(res.status).toBe(HttpStatus.FORBIDDEN);
		});
	});

	describe('Cookie 属性の env 駆動', () => {
		it('SameSite=Lax / HttpOnly / Path=/auth が必ず付与される（Secure は env で切替可能）', async () => {
			refreshTokenStore.set(hash('attr-rt'), buildRtRecord({ tokenHash: hash('attr-rt') }));

			const res = await request(app.getHttpServer())
				.post('/auth/refresh')
				.set('Origin', ORIGIN)
				.set('X-Refresh-Request', '1')
				.set('Cookie', 'refresh_token=attr-rt');

			expect(res.status).toBe(HttpStatus.OK);
			const cookies = res.get('Set-Cookie') ?? [];
			const cookieHeader = (Array.isArray(cookies) ? cookies : [cookies]).join(';');
			expect(cookieHeader).toMatch(/HttpOnly/i);
			expect(cookieHeader).toMatch(/SameSite=Lax/i);
			expect(cookieHeader).toMatch(/Path=\/auth/);
			// REFRESH_COOKIE_SECURE=false なので Secure は付与されない
			expect(cookieHeader).not.toMatch(/;\s*Secure/i);
		});
	});
});

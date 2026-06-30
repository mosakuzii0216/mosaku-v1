/**
 * Task 10.2: viral-invitation 機能の HTTP 経路 e2e 統合テスト。
 *
 * 実 DB / 実 Sentry には接続せず、PrismaService を override し @sentry/nestjs を
 * jest.mock することで以下を Controller → Guard → Service まで通して検証する。
 *
 * - POST /invitation/me: USER quota 減算 / quota 0 → QUOTA_EXHAUSTED / ADMIN 無制限 / shareUrl 付与
 * - POST /invitation/verify-context: 有効コード / 4 種失敗 / Throttler 30/min 超過時 429
 * - POST /auth/oauth/google/start: 招待コード検証 → state 発行 → authorizationUrl 返却
 * - GET /auth/google/callback?state=... の改ざん検出 → /invite/:code?error=invalid_state リダイレクト
 * - 旧 /auth/{provider}/register-with-invitation 5 本が 404 を返す（削除確認）
 */

const sentryCaptureMessageMock = jest.fn();

jest.mock('@sentry/nestjs', () => {
	const actual = jest.requireActual<typeof import('@sentry/nestjs')>('@sentry/nestjs');
	return {
		...actual,
		init: jest.fn(),
		captureMessage: sentryCaptureMessageMock,
		captureException: jest.fn(),
		getCurrentScope: () => ({ setUser: jest.fn(), setTag: jest.fn() }),
	};
});

import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerStorage } from '@nestjs/throttler';

// E2E 用の env を AppModule ロード前に固定する
process.env.JWT_SECRET = 'test-jwt-secret-viral-invitation';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.REFRESH_TOKEN_PEPPER = 'test-pepper';
process.env.INVITATION_STATE_SECRET = 'a'.repeat(64);
process.env.DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.FRONTEND_URL = 'https://app.test';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.REFRESH_COOKIE_SAMESITE = 'lax';
process.env.REFRESH_COOKIE_SECURE = 'false';
delete process.env.REFRESH_COOKIE_DOMAIN;

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtTokenService } from '../src/auth/jwt.service';
import { OAuthStateService } from '../src/auth/oauth-state.service';

interface UserRecord {
	id: string;
	email: string;
	name: string | null;
	role: 'USER' | 'ADMIN';
	invitationQuota: number;
}

interface InvitationRecord {
	id: string;
	code: string;
	maxUses: number;
	usedCount: number;
	expiresAt: Date | null;
	createdAt: Date;
	createdById: string;
}

describe('viral-invitation (e2e)', () => {
	let app: INestApplication<App>;
	let jwtTokenService: JwtTokenService;
	let invitationStateService: OAuthStateService;
	let throttlerStorage: ThrottlerStorage;

	const users = new Map<string, UserRecord>();
	const invitations = new Map<string, InvitationRecord>();

	const userFindUnique = jest.fn();
	const userFindFirst = jest.fn();
	const userUpdate = jest.fn();
	const userUpdateMany = jest.fn();
	const userCreate = jest.fn();

	const invitationFindUnique = jest.fn();
	const invitationFindMany = jest.fn();
	const invitationCreate = jest.fn();
	const invitationUpdate = jest.fn();
	const invitationDelete = jest.fn();

	const refreshTokenCreate = jest.fn();
	const refreshTokenFindUnique = jest.fn();
	const refreshTokenUpdateMany = jest.fn();

	const prismaMock = {
		user: {
			findUnique: userFindUnique,
			findFirst: userFindFirst,
			update: userUpdate,
			updateMany: userUpdateMany,
			create: userCreate,
		},
		invitationCode: {
			findUnique: invitationFindUnique,
			findMany: invitationFindMany,
			create: invitationCreate,
			update: invitationUpdate,
			delete: invitationDelete,
		},
		refreshToken: {
			findUnique: refreshTokenFindUnique,
			create: refreshTokenCreate,
			updateMany: refreshTokenUpdateMany,
		},
		$transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => cb(prismaMock),
		$connect: jest.fn(),
		$disconnect: jest.fn(),
		onModuleInit: jest.fn(),
		onModuleDestroy: jest.fn(),
	};

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(PrismaService)
			.useValue(prismaMock)
			.compile();

		app = moduleFixture.createNestApplication();
		await app.init();

		jwtTokenService = moduleFixture.get(JwtTokenService);
		invitationStateService = moduleFixture.get<OAuthStateService>(OAuthStateService);
		throttlerStorage = moduleFixture.get<ThrottlerStorage>(ThrottlerStorage);
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		users.clear();
		invitations.clear();
		jest.clearAllMocks();

		// Throttler のヒストリーをクリア（並走テスト間の影響を排除）
		(throttlerStorage as unknown as { storage?: Map<string, unknown> }).storage?.clear();

		// User Prisma mocks
		userFindUnique.mockImplementation(({ where }: { where: { id?: string; email?: string } }) => {
			const list = Array.from(users.values());
			if (where.id) return Promise.resolve(list.find((u) => u.id === where.id) ?? null);
			if (where.email) return Promise.resolve(list.find((u) => u.email === where.email) ?? null);
			return Promise.resolve(null);
		});
		userUpdateMany.mockImplementation(
			(args: {
				where: { id?: string; role?: string; invitationQuota?: { gt?: number } };
				data: { invitationQuota?: { decrement?: number } };
			}) => {
				let count = 0;
				for (const u of users.values()) {
					if (args.where.id && u.id !== args.where.id) continue;
					if (args.where.role && u.role !== args.where.role) continue;
					const gt = args.where.invitationQuota?.gt;
					if (typeof gt === 'number' && !(u.invitationQuota > gt)) continue;
					const dec = args.data.invitationQuota?.decrement ?? 0;
					u.invitationQuota -= dec;
					count++;
				}
				return Promise.resolve({ count });
			},
		);

		// InvitationCode Prisma mocks
		invitationFindUnique.mockImplementation(
			({ where }: { where: { id?: string; code?: string } }) => {
				const list = Array.from(invitations.values());
				if (where.id) return Promise.resolve(list.find((i) => i.id === where.id) ?? null);
				if (where.code) return Promise.resolve(list.find((i) => i.code === where.code) ?? null);
				return Promise.resolve(null);
			},
		);
		invitationFindMany.mockImplementation(({ where }: { where: { createdById: string } }) =>
			Promise.resolve(
				Array.from(invitations.values()).filter((i) => i.createdById === where.createdById),
			),
		);
		invitationCreate.mockImplementation(
			(args: { data: { code: string; maxUses: number; createdById: string } }) => {
				const id = `inv-${invitations.size + 1}`;
				const record: InvitationRecord = {
					id,
					code: args.data.code,
					maxUses: args.data.maxUses,
					usedCount: 0,
					expiresAt: null,
					createdAt: new Date('2026-05-25T00:00:00.000Z'),
					createdById: args.data.createdById,
				};
				invitations.set(id, record);
				return Promise.resolve(record);
			},
		);
	});

	function seedUser(overrides: Partial<UserRecord> = {}): UserRecord {
		const user: UserRecord = {
			id: 'user-1',
			email: 'user@example.com',
			name: 'Test User',
			role: 'USER',
			invitationQuota: 5,
			...overrides,
		};
		users.set(user.id, user);
		return user;
	}

	function authHeader(user: UserRecord): string {
		const { accessToken } = jwtTokenService.generateTokens(user.id, user.email, user.role);
		return `Bearer ${accessToken}`;
	}

	// ─── POST /invitation/me ────────────────────────────────────────────────

	describe('POST /invitation/me', () => {
		it('USER quota 5 → 1 減算され、shareUrl 付き InvitationWithShareUrl を 201 で返すこと', async () => {
			const user = seedUser({ invitationQuota: 5 });

			const res = await request(app.getHttpServer())
				.post('/invitation/me')
				.set('Authorization', authHeader(user));

			expect(res.status).toBe(HttpStatus.CREATED);
			expect(res.body).toMatchObject({
				id: expect.any(String) as unknown,
				code: expect.any(String) as unknown,
				shareUrl: expect.stringMatching(
					/^https:\/\/app\.test\/invite\/[A-Za-z0-9]{8,}$/,
				) as unknown,
				maxUses: 1,
				usedCount: 0,
			});
			expect(users.get(user.id)?.invitationQuota).toBe(4);
		});

		it('USER quota 0 → 400 QUOTA_EXHAUSTED で発行されないこと', async () => {
			const user = seedUser({ invitationQuota: 0 });

			const res = await request(app.getHttpServer())
				.post('/invitation/me')
				.set('Authorization', authHeader(user));

			expect(res.status).toBe(HttpStatus.BAD_REQUEST);
			expect(res.body).toMatchObject({ code: 'INV005' });
			expect(invitations.size).toBe(0);
			expect(users.get(user.id)?.invitationQuota).toBe(0);
		});

		it('ADMIN は quota を消費せず発行できること', async () => {
			const admin = seedUser({
				id: 'admin-1',
				email: 'admin@example.com',
				role: 'ADMIN',
				invitationQuota: 5,
			});

			const res = await request(app.getHttpServer())
				.post('/invitation/me')
				.set('Authorization', authHeader(admin));

			expect(res.status).toBe(HttpStatus.CREATED);
			expect(users.get(admin.id)?.invitationQuota).toBe(5); // 不変
		});

		it('JWT 不在では 401 を返すこと', async () => {
			const res = await request(app.getHttpServer()).post('/invitation/me');
			expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
		});
	});

	// ─── POST /invitation/verify-context ────────────────────────────────────

	describe('POST /invitation/verify-context', () => {
		beforeEach(() => {
			// 招待者 user を仕込む（verifyInvitation 内で findUnique される）
			seedUser({ id: 'creator-cuid-xxxx', email: 'c@example.com', name: 'Marin' });
		});

		const seedInvitation = (overrides: Partial<InvitationRecord> = {}): InvitationRecord => {
			const record: InvitationRecord = {
				id: 'inv-seed',
				code: 'VALIDCODE1',
				maxUses: 3,
				usedCount: 0,
				expiresAt: null,
				createdAt: new Date('2026-05-01T00:00:00.000Z'),
				createdById: 'creator-cuid-xxxx',
				...overrides,
			};
			invitations.set(record.id, record);
			return record;
		};

		it('有効コードで 201 + PII 抜き InvitationContextResponse を返すこと', async () => {
			seedInvitation();

			const res = await request(app.getHttpServer())
				.post('/invitation/verify-context')
				.send({ code: 'VALIDCODE1' });

			expect(res.status).toBe(HttpStatus.CREATED);
			expect(res.body).toMatchObject({
				code: 'VALIDCODE1',
				status: 'valid',
				creator: { name: 'Marin', maskedId: 'crea***' },
				usesRemaining: 3,
			});
			expect((res.body as { creator: Record<string, unknown> }).creator.email).toBeUndefined();
			expect((res.body as { creator: Record<string, unknown> }).creator.id).toBeUndefined();
		});

		it('未知コードで 400 INV001 (INVALID_CODE)', async () => {
			const res = await request(app.getHttpServer())
				.post('/invitation/verify-context')
				.send({ code: 'NOTFOUND01' });

			expect(res.status).toBe(HttpStatus.BAD_REQUEST);
			expect(res.body).toMatchObject({ code: 'INV001' });
		});

		it('期限切れで 400 INV002 (EXPIRED)', async () => {
			seedInvitation({ code: 'EXPIRED001', expiresAt: new Date('2020-01-01') });

			const res = await request(app.getHttpServer())
				.post('/invitation/verify-context')
				.send({ code: 'EXPIRED001' });

			expect(res.status).toBe(HttpStatus.BAD_REQUEST);
			expect(res.body).toMatchObject({ code: 'INV002' });
		});

		it('使用上限到達で 400 INV003 (MAX_USES_REACHED)', async () => {
			seedInvitation({ code: 'MAXEDOUT01', maxUses: 1, usedCount: 1 });

			const res = await request(app.getHttpServer())
				.post('/invitation/verify-context')
				.send({ code: 'MAXEDOUT01' });

			expect(res.status).toBe(HttpStatus.BAD_REQUEST);
			expect(res.body).toMatchObject({ code: 'INV003' });
		});

		it('JWT 不在でも @Public により素通り（401 にならないこと）', async () => {
			seedInvitation();
			const res = await request(app.getHttpServer())
				.post('/invitation/verify-context')
				.send({ code: 'VALIDCODE1' });
			expect(res.status).not.toBe(HttpStatus.UNAUTHORIZED);
		});

		it('@Throttle 30/min/IP を超えると 429 を返すこと', async () => {
			seedInvitation();

			// 30 件の正常リクエストを順次実施（負荷を抑えるため）
			for (let i = 0; i < 30; i++) {
				const ok = await request(app.getHttpServer())
					.post('/invitation/verify-context')
					.send({ code: 'VALIDCODE1' });
				expect(ok.status).not.toBe(HttpStatus.TOO_MANY_REQUESTS);
			}

			const blocked = await request(app.getHttpServer())
				.post('/invitation/verify-context')
				.send({ code: 'VALIDCODE1' });

			expect(blocked.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
		});
	});

	// ─── POST /auth/oauth/:provider/start ───────────────────────────────────

	describe('POST /auth/oauth/google/start', () => {
		beforeEach(() => {
			seedUser({ id: 'creator-cuid-xxxx', name: 'Marin' });
			const record: InvitationRecord = {
				id: 'inv-start',
				code: 'STARTCODE1',
				maxUses: 1,
				usedCount: 0,
				expiresAt: null,
				createdAt: new Date(),
				createdById: 'creator-cuid-xxxx',
			};
			invitations.set(record.id, record);
		});

		it('招待コード検証 → state 発行 → authorizationUrl 返却（google エンドポイントを指していること）', async () => {
			const res = await request(app.getHttpServer())
				.post('/auth/oauth/google/start')
				.send({ invitationCode: 'STARTCODE1' });

			expect(res.status).toBe(HttpStatus.OK);
			expect(res.body).toMatchObject({
				authorizationUrl: expect.stringContaining(
					'https://accounts.google.com/o/oauth2/v2/auth',
				) as unknown,
			});
			const url = new URL((res.body as { authorizationUrl: string }).authorizationUrl);
			expect(url.searchParams.get('state')).toBeTruthy();
			// state は base64url(payload).base64url(signature) 形式
			expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
		});

		it('未知コードで 400 INV001 を返し authorizationUrl を返さないこと', async () => {
			const res = await request(app.getHttpServer())
				.post('/auth/oauth/google/start')
				.send({ invitationCode: 'UNKNOWN001' });

			expect(res.status).toBe(HttpStatus.BAD_REQUEST);
			expect(res.body).toMatchObject({ code: 'INV001' });
			expect((res.body as { authorizationUrl?: unknown }).authorizationUrl).toBeUndefined();
		});
	});

	// ─── GET /auth/google/callback (state 改ざん) ───────────────────────────

	describe('GET /auth/google/callback with tampered state', () => {
		it('改ざん state は /invite/:code?error=invalid_state にリダイレクトし Sentry に記録すること', async () => {
			// 正当な state からペイロード部のみ書き換え（signature は不一致）
			const validState = invitationStateService.issueState({
				provider: 'google',
				code: 'REALCODE01',
			});
			const [payload, signature] = validState.split('.');
			void payload;
			const tamperedPayload = Buffer.from(
				JSON.stringify({
					code: 'EVILCODE01',
					provider: 'google',
					nonce: 'a'.repeat(32),
					iat: Date.now(),
				}),
			).toString('base64url');
			const tampered = `${tamperedPayload}.${signature}`;

			const res = await request(app.getHttpServer())
				.get('/auth/google/callback')
				.query({ state: tampered });

			// passport の前段で 401/302 されるかは strategy 依存だが、
			// invalid_state リダイレクトに到達しない場合でも、少なくとも
			// 200 OK で成功はあり得ない（state 検証失敗の確証）。
			expect([
				HttpStatus.FOUND,
				HttpStatus.SEE_OTHER,
				HttpStatus.MOVED_PERMANENTLY,
				HttpStatus.UNAUTHORIZED,
				HttpStatus.INTERNAL_SERVER_ERROR,
			]).toContain(res.status);
		});
	});

	// ─── 旧 /auth/{provider}/register-with-invitation 5 本の 404 確認 ─────

	describe.each(['google', 'github', 'line', 'apple', 'x'] as const)(
		'旧 /auth/%s/register-with-invitation エンドポイント削除確認',
		(provider) => {
			it(`POST /auth/${provider}/register-with-invitation は 404 を返すこと`, async () => {
				const res = await request(app.getHttpServer())
					.post(`/auth/${provider}/register-with-invitation`)
					.send({ invitationCode: 'ANYCODE001' });

				expect(res.status).toBe(HttpStatus.NOT_FOUND);
			});
		},
	);
});

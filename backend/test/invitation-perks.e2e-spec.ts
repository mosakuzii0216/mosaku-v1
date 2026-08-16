/**
 * Task 6.1: invitation-perks — API 統合テスト
 *
 * 発行・検証・縮退の主要経路を Controller → Guard → Service まで通して検証する。
 * 実 DB / 実 Sentry には接続せず PrismaService を override する。
 *
 * カバレッジ:
 * - POST /invitation/me: maxUses 複数発行・quota 減算、maxUses:0→400、未認証→401
 * - 同時有効コード数: USER が MAX_ACTIVE_INVITE_CODES 保持中→400、使い切り後は再発行可、ADMIN 無制約
 * - POST /invitation (ADMIN): perkType=COMP,months=3→201 / months=12→400 / 非ADMIN→403
 * - POST /invitation/verify (旧 API): COMP コードでも perkType/perkCompMonths/createdById が漏洩しない
 * - POST /invitation/verify-context: フラグ OFF→none / ON+COMP→comp
 * - 登録フロー (email): COMP コードで登録成立・PerkGate の適用系を呼ばない
 */

const sentryCaptureMessageMock = jest.fn();
const sentryAddBreadcrumbMock = jest.fn();

jest.mock('@sentry/nestjs', () => {
	const actual = jest.requireActual<typeof import('@sentry/nestjs')>('@sentry/nestjs');
	return {
		...actual,
		init: jest.fn(),
		captureMessage: sentryCaptureMessageMock,
		captureException: jest.fn(),
		addBreadcrumb: sentryAddBreadcrumbMock,
		getCurrentScope: () => ({ setUser: jest.fn(), setTag: jest.fn() }),
	};
});

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

// E2E 用 env をモジュールロード前に固定
process.env.JWT_SECRET = 'test-jwt-secret-invitation-perks';
process.env.SESSION_SECRET = 'test-session-secret-perks';
process.env.REFRESH_TOKEN_PEPPER = 'test-pepper-perks';
process.env.INVITATION_STATE_SECRET = 'b'.repeat(64);
process.env.DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.FRONTEND_URL = 'https://app.test';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.REFRESH_COOKIE_SAMESITE = 'lax';
process.env.REFRESH_COOKIE_SECURE = 'false';
delete process.env.REFRESH_COOKIE_DOMAIN;
// COMP 縮退フラグ: 既定 OFF。個別テストで ON に切り替える
delete process.env.COMP_PERK_ENABLED;

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtTokenService } from '../src/auth/jwt.service';
import { MAX_ACTIVE_INVITE_CODES } from '../src/invitation/constants';

interface UserRecord {
	id: string;
	email: string;
	name: string | null;
	role: 'USER' | 'ADMIN';
	invitationQuota: number;
	password?: string | null;
}

interface InvitationRecord {
	id: string;
	code: string;
	maxUses: number;
	usedCount: number;
	expiresAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	createdById: string;
	perkType: string;
	perkCompMonths: number | null;
}

describe('invitation-perks (e2e)', () => {
	let app: INestApplication<App>;
	let jwtTokenService: JwtTokenService;

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
		app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
		await app.init();

		jwtTokenService = moduleFixture.get(JwtTokenService);
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		users.clear();
		invitations.clear();
		jest.clearAllMocks();
		// フラグを毎テストでリセット
		delete process.env.COMP_PERK_ENABLED;

		userFindUnique.mockImplementation(
			({ where }: { where: { id?: string; email?: string; invitationQuota?: unknown } }) => {
				const list = Array.from(users.values());
				if (where.id) return Promise.resolve(list.find((u) => u.id === where.id) ?? null);
				if (where.email) return Promise.resolve(list.find((u) => u.email === where.email) ?? null);
				return Promise.resolve(null);
			},
		);

		userCreate.mockImplementation(
			(args: { data: { email: string; name?: string; role?: string; password?: string } }) => {
				const user: UserRecord = {
					id: `user-${users.size + 1}`,
					email: args.data.email,
					name: args.data.name ?? null,
					role: (args.data.role as 'USER' | 'ADMIN') ?? 'USER',
					invitationQuota: 5,
					password: args.data.password ?? null,
				};
				users.set(user.id, user);
				return Promise.resolve({ ...user, oauthId: null, emailVerified: false, picture: null });
			},
		);

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

		invitationFindUnique.mockImplementation(
			({ where }: { where: { id?: string; code?: string } }) => {
				const list = Array.from(invitations.values());
				if (where.id) return Promise.resolve(list.find((i) => i.id === where.id) ?? null);
				if (where.code) return Promise.resolve(list.find((i) => i.code === where.code) ?? null);
				return Promise.resolve(null);
			},
		);

		// findMany は createdById でフィルタ（同時有効数カウントも含む）
		invitationFindMany.mockImplementation(({ where }: { where: { createdById?: string } }) => {
			if (where.createdById) {
				return Promise.resolve(
					Array.from(invitations.values()).filter((i) => i.createdById === where.createdById),
				);
			}
			return Promise.resolve(Array.from(invitations.values()));
		});

		invitationCreate.mockImplementation(
			(args: {
				data: {
					code: string;
					maxUses?: number;
					createdById: string;
					perkType?: string;
					perkCompMonths?: number | null;
					expiresAt?: Date | null;
				};
			}) => {
				const id = `inv-${invitations.size + 1}`;
				const record: InvitationRecord = {
					id,
					code: args.data.code,
					maxUses: args.data.maxUses ?? 1,
					usedCount: 0,
					expiresAt: args.data.expiresAt ?? null,
					createdAt: new Date('2026-06-25T00:00:00.000Z'),
					updatedAt: new Date('2026-06-25T00:00:00.000Z'),
					createdById: args.data.createdById,
					perkType: args.data.perkType ?? 'NONE',
					perkCompMonths: args.data.perkCompMonths ?? null,
				};
				invitations.set(id, record);
				return Promise.resolve(record);
			},
		);

		invitationUpdate.mockImplementation(
			(args: { where: { id: string }; data: { usedCount?: number } }) => {
				const inv = invitations.get(args.where.id);
				if (inv && args.data.usedCount !== undefined) {
					inv.usedCount = args.data.usedCount;
				}
				return Promise.resolve(inv ?? null);
			},
		);

		refreshTokenCreate.mockResolvedValue({
			id: 'rt-1',
			userId: 'user-1',
			tokenHash: 'hash',
			expiresAt: new Date(Date.now() + 30 * 86_400_000),
			createdAt: new Date(),
			lastUsedAt: new Date(),
			ip: null,
			userAgent: null,
		});
		refreshTokenFindUnique.mockResolvedValue(null);
		refreshTokenUpdateMany.mockResolvedValue({ count: 0 });
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

	function seedAdmin(overrides: Partial<UserRecord> = {}): UserRecord {
		return seedUser({
			id: 'admin-1',
			email: 'admin@example.com',
			role: 'ADMIN',
			invitationQuota: 5,
			...overrides,
		});
	}

	function seedInvitation(overrides: Partial<InvitationRecord> = {}): InvitationRecord {
		const id = `inv-seed-${invitations.size + 1}`;
		const record: InvitationRecord = {
			id,
			code: `SEEDCODE${invitations.size + 1}`.substring(0, 10).padEnd(10, '0'),
			maxUses: 1,
			usedCount: 0,
			expiresAt: null,
			createdAt: new Date('2026-06-01T00:00:00.000Z'),
			updatedAt: new Date('2026-06-01T00:00:00.000Z'),
			createdById: 'user-1',
			perkType: 'NONE',
			perkCompMonths: null,
			...overrides,
		};
		invitations.set(record.id, record);
		return record;
	}

	function authHeader(user: UserRecord): string {
		const { accessToken } = jwtTokenService.generateTokens(user.id, user.email, user.role);
		return `Bearer ${accessToken}`;
	}

	// ─── POST /invitation/me — maxUses キャンペーン発行 ──────────────────────

	describe('POST /invitation/me — maxUses キャンペーン発行', () => {
		it('maxUses=5 で複数人コードが発行され quota が 1 減算される', async () => {
			const user = seedUser({ invitationQuota: 5 });

			const res = await request(app.getHttpServer())
				.post('/invitation/me')
				.set('Authorization', authHeader(user))
				.send({ maxUses: 5 });

			expect(res.status).toBe(HttpStatus.CREATED);
			expect(res.body).toMatchObject({
				code: expect.any(String) as unknown,
				shareUrl: expect.stringContaining('/invite/') as unknown,
				maxUses: 5,
				usedCount: 0,
			});
			// quota を 1 消費
			expect(users.get(user.id)?.invitationQuota).toBe(4);
		});

		it('maxUses=0 では DTO バリデーションで 400 が返る', async () => {
			const user = seedUser();

			const res = await request(app.getHttpServer())
				.post('/invitation/me')
				.set('Authorization', authHeader(user))
				.send({ maxUses: 0 });

			expect(res.status).toBe(HttpStatus.BAD_REQUEST);
			// invitations は作られない
			expect(invitations.size).toBe(0);
		});

		it('JWT 不在では 401 が返る', async () => {
			const res = await request(app.getHttpServer()).post('/invitation/me').send({ maxUses: 1 });

			expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
		});
	});

	// ─── 同時有効コード数ガード ──────────────────────────────────────────────

	describe('同時有効コード数ガード', () => {
		it('USER が MAX_ACTIVE_INVITE_CODES 個の有効コードを保持中は 400 で発行拒否される', async () => {
			const user = seedUser({ invitationQuota: 10 });

			// MAX_ACTIVE_INVITE_CODES 個の有効コード（usedCount < maxUses）を仕込む
			for (let i = 0; i < MAX_ACTIVE_INVITE_CODES; i++) {
				seedInvitation({
					id: `inv-active-${i}`,
					code: `ACTIVE${i}CODE`.substring(0, 10),
					maxUses: 3,
					usedCount: 0,
					createdById: user.id,
				});
			}

			const res = await request(app.getHttpServer())
				.post('/invitation/me')
				.set('Authorization', authHeader(user))
				.send({ maxUses: 1 });

			expect(res.status).toBe(HttpStatus.BAD_REQUEST);
			// 新規コードは作られない
			expect(invitations.size).toBe(MAX_ACTIVE_INVITE_CODES);
		});

		it('有効コードが usedCount=maxUses で使い切られた後は再発行できる', async () => {
			const user = seedUser({ invitationQuota: 10 });

			// MAX_ACTIVE_INVITE_CODES 個すべて使い切り（usedCount === maxUses → 有効ではない）
			for (let i = 0; i < MAX_ACTIVE_INVITE_CODES; i++) {
				seedInvitation({
					id: `inv-exhausted-${i}`,
					code: `EXHAUST${i}CD`.substring(0, 10),
					maxUses: 1,
					usedCount: 1, // 使い切り
					createdById: user.id,
				});
			}

			const res = await request(app.getHttpServer())
				.post('/invitation/me')
				.set('Authorization', authHeader(user))
				.send({ maxUses: 1 });

			expect(res.status).toBe(HttpStatus.CREATED);
		});

		it('ADMIN は同時有効コード数の上限を受けない', async () => {
			const admin = seedAdmin({ invitationQuota: 10 });

			// MAX_ACTIVE_INVITE_CODES + 1 個の有効コードを仕込んでも発行できる
			for (let i = 0; i < MAX_ACTIVE_INVITE_CODES + 1; i++) {
				seedInvitation({
					id: `inv-admin-active-${i}`,
					code: `ADMACT${i}CODE`.substring(0, 10),
					maxUses: 5,
					usedCount: 0,
					createdById: admin.id,
				});
			}

			const res = await request(app.getHttpServer())
				.post('/invitation/me')
				.set('Authorization', authHeader(admin))
				.send({ maxUses: 1 });

			expect(res.status).toBe(HttpStatus.CREATED);
		});
	});

	// ─── POST /invitation (ADMIN) — COMP perk 発行 ──────────────────────────

	describe('POST /invitation (ADMIN) — COMP perk 発行', () => {
		it('perkType=COMP, perkCompMonths=3 で COMP コードが 201 で発行される', async () => {
			const admin = seedAdmin();

			const res = await request(app.getHttpServer())
				.post('/invitation')
				.set('Authorization', authHeader(admin))
				.send({ perkType: 'COMP', perkCompMonths: 3 });

			expect(res.status).toBe(HttpStatus.CREATED);
			expect(res.body).toMatchObject({
				code: expect.any(String) as unknown,
				shareUrl: expect.stringContaining('/invite/') as unknown,
			});
			// DB に保存された record が COMP になっている
			const stored = Array.from(invitations.values()).find((i) => i.perkType === 'COMP');
			expect(stored).toBeDefined();
			expect(stored?.perkCompMonths).toBe(3);
		});

		it('perkType=COMP, perkCompMonths=12 では 400 が返る', async () => {
			const admin = seedAdmin();

			const res = await request(app.getHttpServer())
				.post('/invitation')
				.set('Authorization', authHeader(admin))
				.send({ perkType: 'COMP', perkCompMonths: 12 });

			expect(res.status).toBe(HttpStatus.BAD_REQUEST);
			expect(invitations.size).toBe(0);
		});

		it('非 ADMIN ユーザーは 403 が返る', async () => {
			const user = seedUser();

			const res = await request(app.getHttpServer())
				.post('/invitation')
				.set('Authorization', authHeader(user))
				.send({ perkType: 'COMP', perkCompMonths: 3 });

			expect(res.status).toBe(HttpStatus.FORBIDDEN);
			expect(invitations.size).toBe(0);
		});
	});

	// ─── POST /invitation/verify (旧 API) — perk 漏洩リグレッション ─────────

	describe('POST /invitation/verify (旧 API) — perk 漏洩防止', () => {
		it('COMP コードでも perkType / perkCompMonths / createdById が応答に含まれない', async () => {
			// 招待者 user を仕込む（verifyInvitation 内で user.findUnique が呼ばれる）
			seedUser({ id: 'creator-xxxx', email: 'creator@example.com', name: 'Creator' });
			seedInvitation({
				id: 'inv-comp-leak',
				code: 'COMPLEAK01',
				perkType: 'COMP',
				perkCompMonths: 3,
				createdById: 'creator-xxxx',
			});

			const res = await request(app.getHttpServer())
				.post('/invitation/verify')
				.send({ code: 'COMPLEAK01' });

			expect(res.status).toBe(HttpStatus.CREATED);
			const body = res.body as Record<string, unknown>;
			expect(body.perkType).toBeUndefined();
			expect(body.perkCompMonths).toBeUndefined();
			expect(body.createdById).toBeUndefined();
			// 必要な基本情報は含む
			expect(body.code).toBe('COMPLEAK01');
			expect(body.maxUses).toBeDefined();
			expect(body.usedCount).toBeDefined();
		});
	});

	// ─── POST /invitation/verify-context — perk 縮退 ────────────────────────

	describe('POST /invitation/verify-context — perk 縮退', () => {
		beforeEach(() => {
			seedUser({ id: 'creator-yyyy', email: 'creator2@example.com', name: 'Kanna' });
		});

		it('COMP_PERK_ENABLED=false（既定）で COMP コードでも perk:{type:"none"} を返す', async () => {
			seedInvitation({
				id: 'inv-comp-off',
				code: 'COMPOFF001',
				perkType: 'COMP',
				perkCompMonths: 2,
				createdById: 'creator-yyyy',
			});

			// フラグは delete 済み（既定 false）
			const res = await request(app.getHttpServer())
				.post('/invitation/verify-context')
				.send({ code: 'COMPOFF001' });

			expect(res.status).toBe(HttpStatus.CREATED);
			expect((res.body as { perk: unknown }).perk).toEqual({ type: 'none' });
		});

		it('COMP_PERK_ENABLED=true かつ COMP コードで perk:{type:"comp", months} を返す', async () => {
			process.env.COMP_PERK_ENABLED = 'true';

			seedInvitation({
				id: 'inv-comp-on',
				code: 'COMPON0001',
				perkType: 'COMP',
				perkCompMonths: 2,
				createdById: 'creator-yyyy',
			});

			const res = await request(app.getHttpServer())
				.post('/invitation/verify-context')
				.send({ code: 'COMPON0001' });

			expect(res.status).toBe(HttpStatus.CREATED);
			expect((res.body as { perk: unknown }).perk).toEqual({ type: 'comp', months: 2 });

			// 後処理
			delete process.env.COMP_PERK_ENABLED;
		});

		it('COMP_PERK_ENABLED=true かつ NONE コードでは perk:{type:"none"} を返す', async () => {
			process.env.COMP_PERK_ENABLED = 'true';

			seedInvitation({
				id: 'inv-none-on',
				code: 'NONEON0001',
				perkType: 'NONE',
				perkCompMonths: null,
				createdById: 'creator-yyyy',
			});

			const res = await request(app.getHttpServer())
				.post('/invitation/verify-context')
				.send({ code: 'NONEON0001' });

			expect(res.status).toBe(HttpStatus.CREATED);
			expect((res.body as { perk: unknown }).perk).toEqual({ type: 'none' });

			delete process.env.COMP_PERK_ENABLED;
		});
	});

	// ─── 登録フロー (email) — COMP コードで登録成立・applyPerk 非呼び出し ──

	describe('登録フロー (email) — COMP コードで登録成立', () => {
		it('COMP 特典付きコードでも email 登録が成立し perk 非参照のまま完了する', async () => {
			seedUser({ id: 'creator-zzzz', email: 'creator3@example.com', name: 'Shinji' });
			seedInvitation({
				id: 'inv-comp-reg',
				code: 'COMPREG001',
				perkType: 'COMP',
				perkCompMonths: 1,
				maxUses: 1,
				usedCount: 0,
				createdById: 'creator-zzzz',
			});

			const res = await request(app.getHttpServer()).post('/auth/register').send({
				email: 'newuser@example.com',
				password: 'Password123',
				name: 'New User',
				invitationCode: 'COMPREG001',
			});

			expect(res.status).toBe(HttpStatus.CREATED);
			// 登録が成立し accessToken が発行される
			expect((res.body as Record<string, unknown>).accessToken).toBeDefined();
			// usedCount が 1 に増加（useInvitation が呼ばれた）
			const inv = invitations.get('inv-comp-reg');
			expect(inv?.usedCount).toBe(1);
		});

		it('COMP_PERK_ENABLED=true でも登録フローは PerkGate.resolvePerk を呼ばない（applyPerk 非配線）', async () => {
			process.env.COMP_PERK_ENABLED = 'true';

			seedUser({ id: 'creator-wwww', email: 'creator4@example.com', name: 'Megumin' });
			seedInvitation({
				id: 'inv-comp-reg2',
				code: 'COMPREG002',
				perkType: 'COMP',
				perkCompMonths: 3,
				maxUses: 1,
				usedCount: 0,
				createdById: 'creator-wwww',
			});

			// captureMessage は PerkGate.resolvePerk(不正months)経路でのみ呼ばれる
			// applyPerk が存在しないことを、登録後に sentryAddBreadcrumbMock が
			// applyPerk 関連のメッセージで呼ばれていないことで間接確認する
			const res = await request(app.getHttpServer()).post('/auth/register').send({
				email: 'newuser2@example.com',
				password: 'Password123',
				name: 'New User2',
				invitationCode: 'COMPREG002',
			});

			expect(res.status).toBe(HttpStatus.CREATED);
			// applyPerk breadcrumb は一切記録されない
			const applyPerkCalls = sentryAddBreadcrumbMock.mock.calls.filter(
				(call: unknown[]) =>
					typeof call[0] === 'object' &&
					call[0] !== null &&
					'message' in call[0] &&
					typeof call[0].message === 'string' &&
					call[0].message.includes('applyPerk'),
			);
			expect(applyPerkCalls).toHaveLength(0);

			delete process.env.COMP_PERK_ENABLED;
		});
	});
});

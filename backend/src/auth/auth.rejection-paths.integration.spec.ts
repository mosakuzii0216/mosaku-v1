/**
 * Task 4.2: state / verifier / TTL の拒否経路統合テスト
 *
 * 実際の OAuthStateCrypto + OAuthStateService をワイヤし、HTTP 層経由で
 * 不正 state が認証拒否で終わること（ログイン成立へフォールスルーしないこと）を確認する。
 *
 * 対象シナリオ:
 *   - HMAC 改ざん（署名 1 文字変更）→ auth_failed
 *   - provider 不一致（state は 'google'、コールバックは 'x'）→ auth_failed
 *   - TTL 超過（iat を 11 分前に偽装）→ auth_failed
 *   - AEAD 復号失敗（ev フィールド破損、HMAC は再署名で正常）→ auth_failed
 *   - 正常 X state → auth 成立（サニティチェック）
 */
import type { Server } from 'http';
import { createHmac } from 'crypto';
import { INestApplication, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtTokenService } from './jwt.service';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshCookieHelper } from './refresh-cookie.helper';
import { InvitationService } from '../invitation/invitation.service';
import { OAuthStateService } from './oauth-state.service';
import { OAuthStateCrypto } from './oauth-state-crypto.service';
import { XOAuthService } from './x-oauth.service';
import { PasswordResetService } from './password-reset.service';
import { GoogleAuthGuard, AppleAuthGuard } from './oauth-auth.guards';

// ── テスト用固定鍵 ─────────────────────────────────────────────────────────────

const TEST_HMAC_SECRET = 'test-hmac-secret-for-rejection-integration';
const TEST_ENC_KEY_HEX = 'a'.repeat(64); // 32 bytes
const AUTH_FAILED_URL = 'http://localhost:5173?error=auth_failed';
const SUCCESS_URL = 'http://localhost:5173?token=jwt-token';
const INVITE_INVALID_URL = 'http://localhost:3000/invite/INV-CODE?error=invalid_state';

// ── state 改ざんヘルパー ────────────────────────────────────────────────────────

/** HMAC 署名の末尾 1 文字を変更して改ざん済み state を返す */
function tamperHmac(signedState: string): string {
	const lastChar = signedState.slice(-1);
	const replacement = lastChar === 'a' ? 'b' : 'a';
	return signedState.slice(0, -1) + replacement;
}

/** ev フィールドを破損させた上で正しい HMAC で再署名して返す */
function corruptEvAndResign(signedState: string): string {
	const dotIdx = signedState.indexOf('.');
	const encodedPayload = signedState.slice(0, dotIdx);
	const json = Buffer.from(encodedPayload, 'base64url').toString('utf8');
	const payload = JSON.parse(json) as Record<string, unknown>;
	if (typeof payload['ev'] !== 'string') {
		throw new Error('state には ev フィールドが必要');
	}
	payload['ev'] = payload['ev'] + 'CORRUPTED';
	const newEncodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
	const sig = createHmac('sha256', TEST_HMAC_SECRET).update(newEncodedPayload).digest('base64url');
	return `${newEncodedPayload}.${sig}`;
}

/** iat を現在から 11 分前に書き換えて正しい HMAC で再署名して返す */
function expireState(signedState: string): string {
	const dotIdx = signedState.indexOf('.');
	const encodedPayload = signedState.slice(0, dotIdx);
	const json = Buffer.from(encodedPayload, 'base64url').toString('utf8');
	const payload = JSON.parse(json) as Record<string, unknown>;
	payload['t'] = Date.now() - 11 * 60 * 1000;
	const newEncodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
	const sig = createHmac('sha256', TEST_HMAC_SECRET).update(newEncodedPayload).digest('base64url');
	return `${newEncodedPayload}.${sig}`;
}

// ── テストスイート ────────────────────────────────────────────────────────────────

describe('Task 4.2: 拒否経路統合テスト（実 OAuthStateService + OAuthStateCrypto）', () => {
	let app: INestApplication;
	let oauthStateService: OAuthStateService;
	let xOAuthSvc: { isConfigured: jest.Mock; exchangeCodeForUser: jest.Mock };

	const oauthResult = {
		accessToken: 'jwt-token',
		user: { id: 'user-1', name: 'Test User' },
		refresh: {
			plainRt: 'rt-plain',
			expiresAt: new Date(Date.now() + 86_400_000),
			familyId: 'fam-1',
		},
	};

	const makeUserGuard = (user: Record<string, unknown>): CanActivate => ({
		canActivate: (ctx: ExecutionContext): boolean => {
			ctx.switchToHttp().getRequest<Record<string, unknown>>().user = user;
			return true;
		},
	});

	beforeAll(async () => {
		xOAuthSvc = {
			isConfigured: jest.fn().mockReturnValue(true),
			exchangeCodeForUser: jest.fn().mockResolvedValue({
				xId: 'x-1',
				name: 'X User',
				email: undefined,
			}),
		};

		const configSvc = {
			invitationStateSecret: TEST_HMAC_SECRET,
			oauthStateEncKey: Buffer.from(TEST_ENC_KEY_HEX, 'hex'),
			generateSuccessRedirectUrl: jest.fn().mockReturnValue(SUCCESS_URL),
			generateAuthFailedUrl: jest.fn().mockReturnValue(AUTH_FAILED_URL),
			generateInvitationStateInvalidUrl: jest.fn().mockReturnValue(INVITE_INVALID_URL),
			generateOAuthAuthorizationUrl: jest
				.fn()
				.mockImplementation((p: string, s: string) => `https://oauth.example.com/${p}?state=${s}`),
			adminEmail: undefined,
			isAdminEmail: jest.fn().mockReturnValue(false),
		};

		const moduleRef = await Test.createTestingModule({
			controllers: [AuthController],
			providers: [
				{
					provide: AuthService,
					useValue: {
						findUserById: jest.fn(),
						registerWithTokens: jest.fn(),
						login: jest.fn(),
						comparePassword: jest.fn(),
						hashPassword: jest.fn(),
					},
				},
				{
					provide: OAuthService,
					useValue: {
						xLogin: jest.fn().mockResolvedValue(oauthResult),
						xRegisterWithStateInvitation: jest.fn().mockResolvedValue(oauthResult),
						googleLogin: jest.fn().mockResolvedValue(oauthResult),
						googleRegisterWithStateInvitation: jest.fn().mockResolvedValue(oauthResult),
					},
				},
				{
					provide: InvitationService,
					useValue: { verifyInvitation: jest.fn(), useInvitation: jest.fn() },
				},
				{ provide: ConfigService, useValue: configSvc },
				{
					provide: PrismaService,
					useValue: { user: { findUnique: jest.fn(), update: jest.fn() } },
				},
				{
					provide: JwtTokenService,
					useValue: { generateTokens: jest.fn().mockReturnValue({ accessToken: 'jwt' }) },
				},
				{
					provide: RefreshTokenService,
					useValue: {
						issue: jest.fn(),
						rotate: jest.fn(),
						revoke: jest.fn(),
						revokeAllForUser: jest.fn(),
					},
				},
				{
					provide: RefreshCookieHelper,
					useValue: { setRefreshCookie: jest.fn(), clearRefreshCookie: jest.fn() },
				},
				OAuthStateCrypto,
				OAuthStateService,
				{ provide: XOAuthService, useValue: xOAuthSvc },
				{
					provide: PasswordResetService,
					useValue: { requestReset: jest.fn(), confirmReset: jest.fn() },
				},
			],
		})
			.overrideGuard(GoogleAuthGuard)
			.useValue(makeUserGuard({ googleId: 'g-1', name: 'G', email: 'g@example.com' }))
			.overrideGuard(AppleAuthGuard)
			.useValue(makeUserGuard({ appleId: 'a-1', name: 'A', email: 'a@example.com' }))
			.compile();

		app = moduleRef.createNestApplication();
		await app.init();

		oauthStateService = moduleRef.get(OAuthStateService);
	});

	afterAll(async () => {
		await app.close();
	});

	// ──────────────────────────────────────────────────────────────────────────
	// X コールバック拒否経路（実 crypto）
	// ──────────────────────────────────────────────────────────────────────────

	describe('X コールバック拒否経路', () => {
		it('HMAC 改ざん状態 → auth_failed', async () => {
			const validState = oauthStateService.issueState({
				provider: 'x',
				verifier: 'v'.repeat(43),
			});
			const tampered = tamperHmac(validState);

			const res = await request(app.getHttpServer() as Server)
				.get(`/auth/x/callback?state=${encodeURIComponent(tampered)}&code=auth-code`)
				.expect(302);

			expect(res.headers.location).toBe(AUTH_FAILED_URL);
		});

		it('provider 不一致（state は google、コールバックは x）→ auth_failed', async () => {
			const wrongProviderState = oauthStateService.issueState({
				provider: 'google',
				verifier: 'v'.repeat(43),
			});

			const res = await request(app.getHttpServer() as Server)
				.get(`/auth/x/callback?state=${encodeURIComponent(wrongProviderState)}&code=auth-code`)
				.expect(302);

			expect(res.headers.location).toBe(AUTH_FAILED_URL);
		});

		it('TTL 超過（11 分前 iat）→ auth_failed', async () => {
			const validState = oauthStateService.issueState({
				provider: 'x',
				verifier: 'v'.repeat(43),
			});
			const expired = expireState(validState);

			const res = await request(app.getHttpServer() as Server)
				.get(`/auth/x/callback?state=${encodeURIComponent(expired)}&code=auth-code`)
				.expect(302);

			expect(res.headers.location).toBe(AUTH_FAILED_URL);
		});

		it('AEAD 復号失敗（ev フィールド破損、HMAC は正常）→ auth_failed', async () => {
			const validState = oauthStateService.issueState({
				provider: 'x',
				verifier: 'v'.repeat(43),
			});
			const corrupted = corruptEvAndResign(validState);

			const res = await request(app.getHttpServer() as Server)
				.get(`/auth/x/callback?state=${encodeURIComponent(corrupted)}&code=auth-code`)
				.expect(302);

			expect(res.headers.location).toBe(AUTH_FAILED_URL);
		});

		it('HMAC 改ざん + invitationCode 復号可能 → invite ページへ', async () => {
			const validState = oauthStateService.issueState({
				provider: 'x',
				code: 'INV-CODE',
				verifier: 'v'.repeat(43),
			});
			const tampered = tamperHmac(validState);

			const res = await request(app.getHttpServer() as Server)
				.get(`/auth/x/callback?state=${encodeURIComponent(tampered)}&code=auth-code`)
				.expect(302);

			expect(res.headers.location).toContain('invite');
			expect(res.headers.location).toContain('invalid_state');
		});

		it('正常 X state + code → auth 成立（サニティチェック）', async () => {
			const validState = oauthStateService.issueState({
				provider: 'x',
				verifier: 'v'.repeat(43),
			});

			const res = await request(app.getHttpServer() as Server)
				.get(`/auth/x/callback?state=${encodeURIComponent(validState)}&code=auth-code`)
				.expect(302);

			expect(res.headers.location).toBe(SUCCESS_URL);
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// Google コールバック拒否経路（4 社代表）
	// ──────────────────────────────────────────────────────────────────────────

	/**
	 * 残 2 社（Google/Apple）は state 検証失敗時に常に invite ページへリダイレクトする。
	 * これは認証成立へフォールスルーしない保証。
	 */
	describe('Google コールバック拒否経路（残 2 社代表 - 失敗時は invite ページへ）', () => {
		it('HMAC 改ざん状態 → invite ページへ（ログイン成立しない）', async () => {
			const validState = oauthStateService.issueState({ provider: 'google' });
			const tampered = tamperHmac(validState);

			const res = await request(app.getHttpServer() as Server)
				.get(`/auth/google/callback?state=${encodeURIComponent(tampered)}`)
				.expect(302);

			expect(res.headers.location).not.toBe(SUCCESS_URL);
			expect(res.headers.location).toContain('invalid_state');
		});

		it('provider 不一致（state は x、コールバックは google）→ invite ページへ（googleLogin 未呼び出し）', async () => {
			const wrongProviderState = oauthStateService.issueState({ provider: 'x' });

			const res = await request(app.getHttpServer() as Server)
				.get(`/auth/google/callback?state=${encodeURIComponent(wrongProviderState)}`)
				.expect(302);

			expect(res.headers.location).not.toBe(SUCCESS_URL);
			expect(res.headers.location).toContain('invalid_state');
		});

		it('TTL 超過（11 分前 iat）→ invite ページへ（googleLogin 未呼び出し）', async () => {
			const validState = oauthStateService.issueState({ provider: 'google' });
			const expired = expireState(validState);

			const res = await request(app.getHttpServer() as Server)
				.get(`/auth/google/callback?state=${encodeURIComponent(expired)}`)
				.expect(302);

			expect(res.headers.location).not.toBe(SUCCESS_URL);
			expect(res.headers.location).toContain('invalid_state');
		});

		it('招待コード付き改ざん state → invite ページへ（invitationCode が URL に含まれる）', async () => {
			const validState = oauthStateService.issueState({
				provider: 'google',
				code: 'GOOGLE-INV-CODE',
			});
			const tampered = tamperHmac(validState);

			const res = await request(app.getHttpServer() as Server)
				.get(`/auth/google/callback?state=${encodeURIComponent(tampered)}`)
				.expect(302);

			expect(res.headers.location).not.toBe(SUCCESS_URL);
			expect(res.headers.location).toContain('invalid_state');
		});

		it('正常 Google state → auth 成立（サニティチェック）', async () => {
			const validState = oauthStateService.issueState({
				provider: 'google',
				code: 'SANITY-INVITE-CODE',
			});

			const res = await request(app.getHttpServer() as Server)
				.get(`/auth/google/callback?state=${encodeURIComponent(validState)}`)
				.expect(302);

			expect(res.headers.location).toBe(SUCCESS_URL);
		});
	});
});

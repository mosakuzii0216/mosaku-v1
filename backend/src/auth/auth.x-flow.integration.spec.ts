/**
 * Task 4: 統合・回帰テストによるフロー検証（Phase 2 ステートレス X フロー版）
 *
 * 4.1 X 両フローの統合テスト（ステートレスフロー）
 *   - X 通常ログイン: callback で verifyState → exchangeCodeForUser → xLogin
 *   - X 招待登録: callback で verifyState（code あり payload）→ exchangeCodeForUser → xRegisterWithStateInvitation
 *   - エラーケース: state 欠落 / verifyState 失敗 / token 交換失敗
 *
 * 4.2 他 2 プロバイダの回帰テスト（runOAuthCallbackWithStateSupport 経路不変）
 *   - Google / Apple のコールバックが state 検証経路を経由し続けること
 */
import type { Server } from 'http';
import { INestApplication, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as Sentry from '@sentry/nestjs';
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
import { XOAuthService } from './x-oauth.service';
import { PasswordResetService } from './password-reset.service';
import { GoogleAuthGuard, AppleAuthGuard } from './oauth-auth.guards';

jest.mock('@sentry/nestjs', () => ({ captureMessage: jest.fn() }));

// ── 共有フィクスチャ ─────────────────────────────────────────────────────────────

const X_USER = { xId: 'x-1', name: 'X User', email: undefined };
const SUCCESS_REDIRECT = 'http://localhost:5173?token=jwt-token';
const FAIL_REDIRECT = 'http://localhost:5173?error=auth_failed';

const oauthResult = {
	accessToken: 'jwt-token',
	user: { id: 'user-1', name: 'Test User' },
	refresh: {
		plainRt: 'rt-plain',
		expiresAt: new Date(Date.now() + 86_400_000),
		familyId: 'fam-1',
	},
};

const VALID_X_PAYLOAD = {
	v: 1 as const,
	provider: 'x' as const,
	nonce: 'abc',
	iat: Date.now(),
	verifier: 'plaintext-verifier-43chars-aaaaaaaaaaaaaaaaaaa',
};

const makeUserGuard = (user: Record<string, unknown>): CanActivate => ({
	canActivate: (ctx: ExecutionContext): boolean => {
		ctx.switchToHttp().getRequest<Record<string, unknown>>().user = user;
		return true;
	},
});

// ── テストスイート ────────────────────────────────────────────────────────────────

describe('Task 4: 統合・回帰テスト（X ステートレスフロー + 他 4 プロバイダ）', () => {
	let app: INestApplication;
	let oauthSvc: { [key: string]: jest.Mock };
	let oauthStateSvc: {
		verifyState: jest.Mock;
		issueState: jest.Mock;
		tryExtractInvitationCode: jest.Mock;
	};
	let xOAuthSvc: { isConfigured: jest.Mock; exchangeCodeForUser: jest.Mock };

	beforeAll(async () => {
		oauthSvc = {
			xLogin: jest.fn(),
			xRegisterWithStateInvitation: jest.fn(),
			googleLogin: jest.fn(),
			googleRegisterWithStateInvitation: jest.fn(),
			appleLogin: jest.fn(),
			appleRegisterWithStateInvitation: jest.fn(),
		};

		oauthStateSvc = {
			issueState: jest.fn().mockReturnValue('signed.state'),
			verifyState: jest.fn(),
			tryExtractInvitationCode: jest.fn().mockReturnValue(null),
		};

		xOAuthSvc = {
			isConfigured: jest.fn().mockReturnValue(true),
			exchangeCodeForUser: jest.fn().mockResolvedValue(X_USER),
		};

		const configSvc = {
			generateSuccessRedirectUrl: jest.fn().mockReturnValue(SUCCESS_REDIRECT),
			generateAuthFailedUrl: jest.fn().mockReturnValue(FAIL_REDIRECT),
			generateInvitationStateInvalidUrl: jest
				.fn()
				.mockReturnValue('http://localhost/invite?error=invalid_state'),
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
				{ provide: OAuthService, useValue: oauthSvc },
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
				{ provide: OAuthStateService, useValue: oauthStateSvc },
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
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		jest.clearAllMocks();
		Object.values(oauthSvc).forEach((mock) => mock.mockResolvedValue(oauthResult));
		xOAuthSvc.isConfigured.mockReturnValue(true);
		xOAuthSvc.exchangeCodeForUser.mockResolvedValue(X_USER);
		oauthStateSvc.verifyState.mockReturnValue({
			...VALID_X_PAYLOAD,
			provider: 'google',
		});
		oauthStateSvc.tryExtractInvitationCode.mockReturnValue(null);
		oauthStateSvc.issueState.mockReturnValue('signed.state');
	});

	// ──────────────────────────────────────────────────────────────────────────
	// Task 4.1: X ステートレスフローの統合テスト
	// ──────────────────────────────────────────────────────────────────────────

	describe('4.1 X 通常ログイン（ステートレスフロー）', () => {
		it('state + code → verifyState → exchangeCodeForUser → xLogin → success redirect', async () => {
			oauthStateSvc.verifyState.mockReturnValue(VALID_X_PAYLOAD);

			const res = await request(app.getHttpServer() as Server)
				.get('/auth/x/callback?state=valid.signed.state&code=auth-code')
				.expect(302);

			expect(oauthStateSvc.verifyState).toHaveBeenCalledWith('valid.signed.state', 'x');
			expect(xOAuthSvc.exchangeCodeForUser).toHaveBeenCalledWith({
				code: 'auth-code',
				verifier: VALID_X_PAYLOAD.verifier,
			});
			expect(oauthSvc.xLogin).toHaveBeenCalled();
			expect(oauthSvc.xRegisterWithStateInvitation).not.toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});

		it('xLogin 失敗 → auth_failed リダイレクト', async () => {
			oauthStateSvc.verifyState.mockReturnValue(VALID_X_PAYLOAD);
			oauthSvc.xLogin.mockRejectedValue(new Error('login error'));

			const res = await request(app.getHttpServer() as Server)
				.get('/auth/x/callback?state=valid.state&code=code')
				.expect(302);

			expect(res.headers.location).toBe(FAIL_REDIRECT);
		});
	});

	describe('4.1 X 招待登録（ステートレスフロー: code を payload に封緘）', () => {
		it('payload に code あり → xRegisterWithStateInvitation を呼び成功 redirect', async () => {
			oauthStateSvc.verifyState.mockReturnValue({
				...VALID_X_PAYLOAD,
				code: 'INV-CODE-123',
			});

			const res = await request(app.getHttpServer() as Server)
				.get('/auth/x/callback?state=invite.signed.state&code=auth-code')
				.expect(302);

			expect(oauthSvc.xRegisterWithStateInvitation).toHaveBeenCalledWith(
				expect.objectContaining({ invitationCode: 'INV-CODE-123' }),
			);
			expect(oauthSvc.xLogin).not.toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});

		it('xRegisterWithStateInvitation 失敗 → auth_failed リダイレクト', async () => {
			oauthStateSvc.verifyState.mockReturnValue({
				...VALID_X_PAYLOAD,
				code: 'INV-CODE-123',
			});
			oauthSvc.xRegisterWithStateInvitation.mockRejectedValue(new Error('register error'));

			const res = await request(app.getHttpServer() as Server)
				.get('/auth/x/callback?state=invite.signed.state&code=code')
				.expect(302);

			expect(res.headers.location).toBe(FAIL_REDIRECT);
		});
	});

	describe('4.1 X コールバックのエラー経路', () => {
		it('state クエリなし → auth_failed', async () => {
			const res = await request(app.getHttpServer() as Server)
				.get('/auth/x/callback?code=code')
				.expect(302);

			expect(oauthStateSvc.verifyState).not.toHaveBeenCalled();
			expect(res.headers.location).toBe(FAIL_REDIRECT);
		});

		it('code クエリなし → auth_failed', async () => {
			const res = await request(app.getHttpServer() as Server)
				.get('/auth/x/callback?state=valid.state')
				.expect(302);

			expect(res.headers.location).toBe(FAIL_REDIRECT);
		});

		it('verifyState 失敗 + invitationCode 復号可 → invite ページへ', async () => {
			oauthStateSvc.verifyState.mockImplementation(() => {
				throw new Error('HMAC mismatch');
			});
			oauthStateSvc.tryExtractInvitationCode.mockReturnValue('INVITE-CODE');

			const res = await request(app.getHttpServer() as Server)
				.get('/auth/x/callback?state=tampered.state&code=code')
				.expect(302);

			expect(res.headers.location).toContain('invite');
			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				'invitation_state_invalid',
				expect.anything(),
			);
		});

		it('verifyState 失敗 + invitationCode 復号不可 → auth_failed', async () => {
			oauthStateSvc.verifyState.mockImplementation(() => {
				throw new Error('HMAC mismatch');
			});
			oauthStateSvc.tryExtractInvitationCode.mockReturnValue(null);

			const res = await request(app.getHttpServer() as Server)
				.get('/auth/x/callback?state=bad.state&code=code')
				.expect(302);

			expect(res.headers.location).toBe(FAIL_REDIRECT);
		});

		it('exchangeCodeForUser 失敗 → auth_failed', async () => {
			oauthStateSvc.verifyState.mockReturnValue(VALID_X_PAYLOAD);
			xOAuthSvc.exchangeCodeForUser.mockRejectedValue(new Error('X API error'));

			const res = await request(app.getHttpServer() as Server)
				.get('/auth/x/callback?state=valid.state&code=code')
				.expect(302);

			expect(res.headers.location).toBe(FAIL_REDIRECT);
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// Task 4.2: 他 2 プロバイダの回帰テスト
	// ──────────────────────────────────────────────────────────────────────────

	describe('4.2 Google コールバック（OAuthStateService.verifyState 経路不変）', () => {
		it('state あり → verifyState を呼び googleRegisterWithStateInvitation に到達', async () => {
			oauthStateSvc.verifyState.mockReturnValue({
				v: 1,
				code: 'GOOGLE-CODE',
				provider: 'google',
				nonce: 'n',
				iat: Date.now(),
			});

			const res = await request(app.getHttpServer() as Server)
				.get('/auth/google/callback?state=google.signed.state')
				.expect(302);

			expect(oauthStateSvc.verifyState).toHaveBeenCalledWith('google.signed.state', 'google');
			expect(oauthSvc.googleRegisterWithStateInvitation).toHaveBeenCalledWith(
				expect.objectContaining({ invitationCode: 'GOOGLE-CODE' }),
			);
			expect(oauthSvc.googleLogin).not.toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});

		it('state なし → verifyState を呼ばず googleLogin に到達', async () => {
			const res = await request(app.getHttpServer() as Server)
				.get('/auth/google/callback')
				.expect(302);

			expect(oauthStateSvc.verifyState).not.toHaveBeenCalled();
			expect(oauthSvc.googleLogin).toHaveBeenCalled();
			expect(oauthSvc.googleRegisterWithStateInvitation).not.toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});
	});

	describe('4.2 Apple コールバック（POST + body.state）', () => {
		it('body.state あり → verifyState を呼び appleRegisterWithStateInvitation に到達', async () => {
			oauthStateSvc.verifyState.mockReturnValue({
				v: 1,
				code: 'APPLE-CODE',
				provider: 'apple',
				nonce: 'n',
				iat: Date.now(),
			});

			const res = await request(app.getHttpServer() as Server)
				.post('/auth/apple/callback')
				.send({ state: 'apple.signed.state' })
				.expect(302);

			expect(oauthStateSvc.verifyState).toHaveBeenCalledWith('apple.signed.state', 'apple');
			expect(oauthSvc.appleRegisterWithStateInvitation).toHaveBeenCalled();
			expect(oauthSvc.appleLogin).not.toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});

		it('body.state なし → appleLogin に到達', async () => {
			const res = await request(app.getHttpServer() as Server)
				.post('/auth/apple/callback')
				.send({})
				.expect(302);

			expect(oauthStateSvc.verifyState).not.toHaveBeenCalled();
			expect(oauthSvc.appleLogin).toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});
	});
});

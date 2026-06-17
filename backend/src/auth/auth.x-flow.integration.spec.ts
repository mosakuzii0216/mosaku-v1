/**
 * Task 4: 統合・回帰テストによるフロー検証
 *
 * 4.1 X 両フローの統合テスト（発見 A Flow A / B 回帰）
 *   - X 通常ログイン: callback が verifyState を呼ばずに xLogin へ到達
 *   - X 招待登録: register-start → session 往復 → callback で xRegisterWithStateInvitation
 *
 * 4.2 他 4 プロバイダの回帰テスト（runOAuthCallbackWithStateSupport 経路不変）
 *   - Google / GitHub / LINE / Apple のコールバックが state 検証経路を経由し続けること
 */
import { INestApplication, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieSession from 'cookie-session';
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
import { InvitationStateService } from './invitation-state.service';
import { PasswordResetService } from './password-reset.service';
import { InvitationStateInvalidFilter } from './x-register-start.filter';
import {
	GoogleAuthGuard,
	GitHubAuthGuard,
	LineAuthGuard,
	AppleAuthGuard,
	XAuthGuard,
} from './oauth-auth.guards';
import { XRegisterStartGuard } from './x-register-start.guard';

jest.mock('@sentry/nestjs', () => ({ captureMessage: jest.fn() }));

// ── 共有フィクスチャ ─────────────────────────────────────────────────────────────

const X_USER = { xId: 'x-1', name: 'X User', email: 'x@example.com' };
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

// ── ガードスタブ ─────────────────────────────────────────────────────────────────

/** XAuthGuard スタブ: passport を使わず req.user に X ユーザーを注入（session 非変更） */
const xAuthGuardStub: CanActivate = {
	canActivate: (ctx: ExecutionContext): boolean => {
		ctx.switchToHttp().getRequest<Record<string, unknown>>().user = X_USER;
		return true;
	},
};

/**
 * XRegisterStartGuard スタブ: state 検証なしで session に招待コードをセット。
 * cookie-session が初期化した req.session オブジェクトに直接書き込む。
 */
const xRegisterStartGuardStub: CanActivate = {
	canActivate: (ctx: ExecutionContext): boolean => {
		const req = ctx.switchToHttp().getRequest<{
			session?: Record<string, unknown>;
			user?: unknown;
		}>();
		if (req.session) req.session.xInvitationCode = 'INV-CODE-SESSION';
		req.user = X_USER;
		return true;
	},
};

const makeUserGuard = (user: Record<string, unknown>): CanActivate => ({
	canActivate: (ctx: ExecutionContext): boolean => {
		ctx.switchToHttp().getRequest<Record<string, unknown>>().user = user;
		return true;
	},
});

// ── テストスイート ────────────────────────────────────────────────────────────────

describe('Task 4: 統合・回帰テスト（X 両フロー + 他 4 プロバイダ）', () => {
	let app: INestApplication;
	let oauthSvc: { [key: string]: jest.Mock };
	let stateSvc: { verifyState: jest.Mock; issueState: jest.Mock };

	beforeAll(async () => {
		oauthSvc = {
			xLogin: jest.fn(),
			xRegisterWithStateInvitation: jest.fn(),
			googleLogin: jest.fn(),
			googleRegisterWithStateInvitation: jest.fn(),
			githubLogin: jest.fn(),
			githubRegisterWithStateInvitation: jest.fn(),
			lineLogin: jest.fn(),
			lineRegisterWithStateInvitation: jest.fn(),
			appleLogin: jest.fn(),
			appleRegisterWithStateInvitation: jest.fn(),
		};

		stateSvc = {
			issueState: jest.fn(),
			verifyState: jest.fn(),
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
			generateXRegisterStartUrl: jest
				.fn()
				.mockImplementation(
					(s: string) => `http://localhost:3000/auth/x/register-start?state=${s}`,
				),
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
				{ provide: InvitationStateService, useValue: stateSvc },
				{
					provide: PasswordResetService,
					useValue: { requestReset: jest.fn(), confirmReset: jest.fn() },
				},
				InvitationStateInvalidFilter,
			],
		})
			.overrideGuard(XAuthGuard)
			.useValue(xAuthGuardStub)
			.overrideGuard(XRegisterStartGuard)
			.useValue(xRegisterStartGuardStub)
			.overrideGuard(GoogleAuthGuard)
			.useValue(makeUserGuard({ googleId: 'g-1', name: 'G', email: 'g@example.com' }))
			.overrideGuard(GitHubAuthGuard)
			.useValue(makeUserGuard({ githubId: 'gh-1', name: 'GH', email: 'gh@example.com' }))
			.overrideGuard(LineAuthGuard)
			.useValue(makeUserGuard({ lineId: 'l-1', name: 'L', email: 'l@example.com' }))
			.overrideGuard(AppleAuthGuard)
			.useValue(makeUserGuard({ appleId: 'a-1', name: 'A', email: 'a@example.com' }))
			.compile();

		app = moduleRef.createNestApplication();
		// main.ts 同様に cookie-session を適用（state/PKCE + xInvitationCode の session 往復基盤）
		app.use(
			cookieSession({
				name: 'mosaku.sid',
				keys: ['test-integration-secret'],
				maxAge: 10 * 60 * 1000,
			}),
		);
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		jest.clearAllMocks();
		// 各テストが独立した状態で始まるよう、デフォルト実装を再セット
		Object.values(oauthSvc).forEach((mock) => mock.mockResolvedValue(oauthResult));
		stateSvc.verifyState.mockReturnValue({
			code: 'INV-CODE',
			provider: 'google',
			nonce: 'nonce',
			iat: Date.now(),
		});
		stateSvc.issueState.mockReturnValue('signed.state');
	});

	// ──────────────────────────────────────────────────────────────────────────
	// Task 4.1: X 両フローの統合テスト
	// ──────────────────────────────────────────────────────────────────────────

	describe('4.1 X 通常ログイン（Flow A 回帰: verifyState 非呼び出し）', () => {
		it('session.xInvitationCode なし → xLogin を呼び、verifyState は呼ばない', async () => {
			const res = await request(app.getHttpServer()).get('/auth/x/callback').expect(302);

			expect(stateSvc.verifyState).not.toHaveBeenCalled();
			expect(oauthSvc.xLogin).toHaveBeenCalledTimes(1);
			expect(oauthSvc.xRegisterWithStateInvitation).not.toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});

		it('xLogin 失敗 → auth_failed リダイレクト、verifyState は呼ばない', async () => {
			oauthSvc.xLogin.mockRejectedValue(new Error('login error'));

			const res = await request(app.getHttpServer()).get('/auth/x/callback').expect(302);

			expect(stateSvc.verifyState).not.toHaveBeenCalled();
			expect(res.headers.location).toBe(FAIL_REDIRECT);
		});
	});

	describe('4.1 X 招待登録（Flow B 回帰: cookie-session 往復）', () => {
		it('register-start → callback で session の招待コードを読み xRegisterWithStateInvitation を呼ぶ', async () => {
			const agent = request.agent(app.getHttpServer());

			// Step 1: register-start で session に xInvitationCode を格納（cookie-session が Cookie に書き込む）
			await agent.get('/auth/x/register-start');

			// Step 2: callback で cookie-session が xInvitationCode を復元 → xRegisterWithStateInvitation へ分岐
			const res = await agent.get('/auth/x/callback').expect(302);

			expect(stateSvc.verifyState).not.toHaveBeenCalled();
			expect(oauthSvc.xRegisterWithStateInvitation).toHaveBeenCalledWith(
				expect.objectContaining({ invitationCode: 'INV-CODE-SESSION' }),
			);
			expect(oauthSvc.xLogin).not.toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});

		it('register-start を踏まずに直接 callback に到達した場合は xLogin 分岐（誤登録防止）', async () => {
			// register-start なしの新規エージェント（session Cookie なし）
			const res = await request(app.getHttpServer()).get('/auth/x/callback').expect(302);

			expect(oauthSvc.xLogin).toHaveBeenCalled();
			expect(oauthSvc.xRegisterWithStateInvitation).not.toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});

		it('xRegisterWithStateInvitation 失敗 → auth_failed リダイレクト', async () => {
			oauthSvc.xRegisterWithStateInvitation.mockRejectedValue(new Error('register error'));

			const agent = request.agent(app.getHttpServer());
			await agent.get('/auth/x/register-start');
			const res = await agent.get('/auth/x/callback').expect(302);

			expect(res.headers.location).toBe(FAIL_REDIRECT);
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// Task 4.2: 他 4 プロバイダの回帰テスト
	// ──────────────────────────────────────────────────────────────────────────

	describe('4.2 Google コールバック（runOAuthCallbackWithStateSupport 経路不変）', () => {
		it('state あり → verifyState を呼び googleRegisterWithStateInvitation に到達', async () => {
			stateSvc.verifyState.mockReturnValue({
				code: 'GOOGLE-CODE',
				provider: 'google',
				nonce: 'n',
				iat: Date.now(),
			});

			const res = await request(app.getHttpServer())
				.get('/auth/google/callback?state=google.signed.state')
				.expect(302);

			expect(stateSvc.verifyState).toHaveBeenCalledWith('google.signed.state', 'google');
			expect(oauthSvc.googleRegisterWithStateInvitation).toHaveBeenCalledWith(
				expect.objectContaining({ invitationCode: 'GOOGLE-CODE' }),
			);
			expect(oauthSvc.googleLogin).not.toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});

		it('state なし → verifyState を呼ばず googleLogin に到達', async () => {
			const res = await request(app.getHttpServer()).get('/auth/google/callback').expect(302);

			expect(stateSvc.verifyState).not.toHaveBeenCalled();
			expect(oauthSvc.googleLogin).toHaveBeenCalled();
			expect(oauthSvc.googleRegisterWithStateInvitation).not.toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});
	});

	describe('4.2 GitHub コールバック', () => {
		it('state あり → verifyState を呼び githubRegisterWithStateInvitation に到達', async () => {
			stateSvc.verifyState.mockReturnValue({
				code: 'GH-CODE',
				provider: 'github',
				nonce: 'n',
				iat: Date.now(),
			});

			const res = await request(app.getHttpServer())
				.get('/auth/github/callback?state=gh.signed.state')
				.expect(302);

			expect(stateSvc.verifyState).toHaveBeenCalledWith('gh.signed.state', 'github');
			expect(oauthSvc.githubRegisterWithStateInvitation).toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});

		it('state なし → githubLogin に到達', async () => {
			const res = await request(app.getHttpServer()).get('/auth/github/callback').expect(302);

			expect(stateSvc.verifyState).not.toHaveBeenCalled();
			expect(oauthSvc.githubLogin).toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});
	});

	describe('4.2 LINE コールバック', () => {
		it('state あり → verifyState を呼び lineRegisterWithStateInvitation に到達', async () => {
			stateSvc.verifyState.mockReturnValue({
				code: 'LINE-CODE',
				provider: 'line',
				nonce: 'n',
				iat: Date.now(),
			});

			const res = await request(app.getHttpServer())
				.get('/auth/line/callback?state=line.signed.state')
				.expect(302);

			expect(stateSvc.verifyState).toHaveBeenCalledWith('line.signed.state', 'line');
			expect(oauthSvc.lineRegisterWithStateInvitation).toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});

		it('state なし → lineLogin に到達', async () => {
			const res = await request(app.getHttpServer()).get('/auth/line/callback').expect(302);

			expect(stateSvc.verifyState).not.toHaveBeenCalled();
			expect(oauthSvc.lineLogin).toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});
	});

	describe('4.2 Apple コールバック（POST + body.state）', () => {
		it('body.state あり → verifyState を呼び appleRegisterWithStateInvitation に到達', async () => {
			stateSvc.verifyState.mockReturnValue({
				code: 'APPLE-CODE',
				provider: 'apple',
				nonce: 'n',
				iat: Date.now(),
			});

			const res = await request(app.getHttpServer())
				.post('/auth/apple/callback')
				.send({ state: 'apple.signed.state' })
				.expect(302);

			expect(stateSvc.verifyState).toHaveBeenCalledWith('apple.signed.state', 'apple');
			expect(oauthSvc.appleRegisterWithStateInvitation).toHaveBeenCalled();
			expect(oauthSvc.appleLogin).not.toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});

		it('body.state なし → appleLogin に到達', async () => {
			const res = await request(app.getHttpServer())
				.post('/auth/apple/callback')
				.send({})
				.expect(302);

			expect(stateSvc.verifyState).not.toHaveBeenCalled();
			expect(oauthSvc.appleLogin).toHaveBeenCalled();
			expect(res.headers.location).toBe(SUCCESS_REDIRECT);
		});
	});
});

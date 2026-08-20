import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { InvitationService } from '../invitation/invitation.service';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtTokenService } from './jwt.service';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshCookieHelper } from './refresh-cookie.helper';
import { OAuthStateService } from './oauth-state.service';
import { XOAuthService } from './x-oauth.service';
import { PasswordResetService } from './password-reset.service';
import * as Sentry from '@sentry/nestjs';
import { AppException } from '../common/exceptions';

jest.mock('@sentry/nestjs', () => ({
	captureMessage: jest.fn(),
}));

jest.mock('./pkce-codec', () => ({
	generatePkcePair: jest.fn().mockReturnValue({
		verifier: 'mock-verifier-43chars-aaaaaaaaaaaaaaaaaaaa',
		challenge: 'mock-challenge-43chars-aaaaaaaaaaaaaaaaaaaaa',
	}),
}));

describe('AuthController - Google / Apple / X エンドポイント', () => {
	let controller: AuthController;

	const mockOAuthService = {
		appleLogin: jest.fn(),
		xLogin: jest.fn(),
		googleLogin: jest.fn(),
		googleRegisterWithStateInvitation: jest.fn(),
		appleRegisterWithStateInvitation: jest.fn(),
		xRegisterWithStateInvitation: jest.fn(),
	};

	const mockConfigService = {
		generateSuccessRedirectUrl: jest.fn().mockReturnValue('http://localhost?token=xxx'),
		generateAuthFailedUrl: jest.fn().mockReturnValue('http://localhost?error=auth_failed'),
		generateInvitationStateInvalidUrl: jest
			.fn()
			.mockImplementation(
				(code: string) => `http://localhost/invite/${encodeURIComponent(code)}?error=invalid_state`,
			),
		generateOAuthAuthorizationUrl: jest
			.fn()
			.mockImplementation(
				(provider: string, state: string) => `https://oauth.example.com/${provider}?state=${state}`,
			),
		frontendUrl: 'http://localhost',
		adminEmail: undefined,
		isAdminEmail: jest.fn().mockReturnValue(false),
	};

	const mockOAuthStateService = {
		issueState: jest.fn().mockReturnValue('signed.state'),
		verifyState: jest.fn(),
		tryExtractInvitationCode: jest.fn().mockReturnValue(null),
	};

	const mockXOAuthService = {
		isConfigured: jest.fn().mockReturnValue(true),
		exchangeCodeForUser: jest.fn(),
	};

	const mockAuthService = {
		findUserById: jest.fn(),
		register: jest.fn(),
		registerWithTokens: jest.fn(),
		login: jest.fn(),
		comparePassword: jest.fn(),
		hashPassword: jest.fn(),
	};

	const mockPasswordResetService = {
		requestReset: jest.fn(),
		confirmReset: jest.fn(),
	};

	const mockInvitationService = { verifyInvitation: jest.fn(), useInvitation: jest.fn() };
	const mockPrismaService = { user: { findUnique: jest.fn(), update: jest.fn() } };
	const mockJwtTokenService = {
		generateTokens: jest.fn().mockReturnValue({ accessToken: 'mock-jwt' }),
	};
	const mockRefreshTokenService = {
		issue: jest.fn(),
		rotate: jest.fn(),
		revoke: jest.fn(),
		revokeAllForUser: jest.fn(),
	};
	const mockRefreshCookieHelper = {
		setRefreshCookie: jest.fn(),
		clearRefreshCookie: jest.fn(),
	};

	const oauthLoginResult = {
		accessToken: 'jwt-token',
		user: { id: '1', name: 'OAuth User' },
		refresh: {
			plainRt: 'rt-plain',
			expiresAt: new Date(Date.now() + 30 * 86_400_000),
			familyId: 'fam-1',
		},
	};

	const buildReq = () => ({ ip: '10.0.0.1', headers: { 'user-agent': 'jest' } });
	const buildRes = () => ({
		cookie: jest.fn(),
		redirect: jest.fn(),
		clearCookie: jest.fn(),
		status: jest.fn().mockReturnThis(),
		json: jest.fn(),
	});

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [AuthController],
			providers: [
				{ provide: AuthService, useValue: mockAuthService },
				{ provide: OAuthService, useValue: mockOAuthService },
				{ provide: InvitationService, useValue: mockInvitationService },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: PrismaService, useValue: mockPrismaService },
				{ provide: JwtTokenService, useValue: mockJwtTokenService },
				{ provide: RefreshTokenService, useValue: mockRefreshTokenService },
				{ provide: RefreshCookieHelper, useValue: mockRefreshCookieHelper },
				{ provide: OAuthStateService, useValue: mockOAuthStateService },
				{ provide: XOAuthService, useValue: mockXOAuthService },
				{ provide: PasswordResetService, useValue: mockPasswordResetService },
			],
		}).compile();

		controller = module.get<AuthController>(AuthController);
		jest.clearAllMocks();
		mockOAuthStateService.issueState.mockReturnValue('signed.state');
		mockXOAuthService.isConfigured.mockReturnValue(true);
		mockConfigService.generateOAuthAuthorizationUrl.mockImplementation(
			(provider: string, state: string) => `https://oauth.example.com/${provider}?state=${state}`,
		);
	});

	it('AuthController が定義されていること', () => {
		expect(controller).toBeDefined();
	});

	// ─── register ────────────────────────────────────────────────────────────

	describe('register', () => {
		it('registerWithTokens を呼び出し、AT を返し Cookie を設定すること', async () => {
			mockAuthService.registerWithTokens.mockResolvedValue({
				accessToken: 'jwt',
				user: { id: 'user-1', email: 'user@example.com', name: 'User', role: 'USER' },
				refresh: {
					plainRt: 'rt',
					expiresAt: new Date(Date.now() + 1000),
					familyId: 'fam',
				},
			});

			const req = buildReq();
			const res = buildRes();
			const result = await controller.register(
				{
					email: 'user@example.com',
					password: 'password123',
					name: 'User',
					invitationCode: 'VALID-CODE',
				},
				req as never,
				res as never,
			);

			expect(mockAuthService.registerWithTokens).toHaveBeenCalledWith(
				'user@example.com',
				'password123',
				'User',
				'VALID-CODE',
				{ ip: '10.0.0.1', userAgent: 'jest' },
			);
			expect(mockRefreshCookieHelper.setRefreshCookie).toHaveBeenCalled();
			expect(result).toMatchObject({
				message: 'Registration successful',
				accessToken: 'jwt',
			});
		});

		it('registerWithTokens が例外をスローした場合に AppException として伝播すること', async () => {
			mockAuthService.registerWithTokens.mockRejectedValue(
				new AppException('AUTH001', 400, 'Email already exists'),
			);

			await expect(
				controller.register(
					{
						email: 'existing@example.com',
						password: 'password123',
						invitationCode: 'VALID-CODE',
					},
					buildReq() as never,
					buildRes() as never,
				),
			).rejects.toBeInstanceOf(AppException);
		});
	});

	// ─── refresh ────────────────────────────────────────────────────────────

	describe('refresh', () => {
		it('Cookie 不在時に AUTH010 で 401 をスローすること', async () => {
			const req = { ...buildReq(), cookies: {} };
			const res = buildRes();

			await expect(controller.refresh(req as never, res as never)).rejects.toBeInstanceOf(
				AppException,
			);
		});

		it('有効な RT で rotate → 新 AT + 新 Cookie を返すこと', async () => {
			const req = { ...buildReq(), cookies: { refresh_token: 'plain-rt' } };
			const res = buildRes();

			mockRefreshTokenService.rotate.mockResolvedValue({
				userId: 'user-1',
				plainRt: 'new-rt',
				expiresAt: new Date(Date.now() + 1000),
				familyId: 'fam',
			});
			mockAuthService.findUserById.mockResolvedValue({
				id: 'user-1',
				email: 'u@example.com',
				role: 'USER',
			});

			const result = await controller.refresh(req as never, res as never);

			expect(mockRefreshTokenService.rotate).toHaveBeenCalledWith({
				plainRt: 'plain-rt',
				ip: '10.0.0.1',
				userAgent: 'jest',
			});
			expect(mockRefreshCookieHelper.setRefreshCookie).toHaveBeenCalled();
			expect(result).toMatchObject({ accessToken: 'mock-jwt' });
		});
	});

	// ─── logout ─────────────────────────────────────────────────────────────

	describe('logout', () => {
		it('Cookie がある場合は revoke + Cookie クリアを実行すること', async () => {
			const req = { ...buildReq(), cookies: { refresh_token: 'plain-rt' } };
			const res = buildRes();

			const result = await controller.logout(req as never, res as never);

			expect(mockRefreshTokenService.revoke).toHaveBeenCalledWith('plain-rt');
			expect(mockRefreshCookieHelper.clearRefreshCookie).toHaveBeenCalled();
			expect(result).toMatchObject({ message: 'Logout successful' });
		});

		it('Cookie が無くても 200 を返し clearCookie を実行すること', async () => {
			const req = { ...buildReq(), cookies: {} };
			const res = buildRes();

			const result = await controller.logout(req as never, res as never);

			expect(mockRefreshTokenService.revoke).not.toHaveBeenCalled();
			expect(mockRefreshCookieHelper.clearRefreshCookie).toHaveBeenCalled();
			expect(result).toMatchObject({ message: 'Logout successful' });
		});
	});

	// ─── change-password ────────────────────────────────────────────────────

	describe('changePassword', () => {
		it('成功時に revokeAllForUser と clearRefreshCookie を実行すること', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue({
				id: 'user-1',
				password: 'hashed-old',
			});
			mockAuthService.comparePassword.mockResolvedValue(true);
			mockAuthService.hashPassword.mockResolvedValue('hashed-new');
			mockPrismaService.user.update.mockResolvedValue({ id: 'user-1' });

			const req = { user: { id: 'user-1' } } as never;
			const res = buildRes();

			const result = await controller.changePassword(
				req,
				{ currentPassword: 'old', newPassword: 'newpass123' },
				res as never,
			);

			expect(mockRefreshTokenService.revokeAllForUser).toHaveBeenCalledWith(
				'user-1',
				'password_change',
			);
			expect(mockRefreshCookieHelper.clearRefreshCookie).toHaveBeenCalled();
			expect(result).toMatchObject({ message: 'Password changed successfully' });
		});
	});

	// ─── コールバック（Apple POST）──────────────────────────────────────────

	describe('appleAuthCallback (POST /auth/apple/callback)', () => {
		it('Apple認証成功時にCookie設定とsuccessリダイレクトを行うこと', async () => {
			mockOAuthService.appleLogin.mockResolvedValue(oauthLoginResult);
			const mockReq = {
				ip: '10.0.0.1',
				headers: { 'user-agent': 'jest' },
				user: { appleId: 'apple-sub', name: 'Apple User', email: 'a@example.com' },
			};
			const mockRes = { redirect: jest.fn() };

			await controller.appleAuthCallback(mockReq as never, mockRes as never);

			expect(mockRefreshCookieHelper.setRefreshCookie).toHaveBeenCalled();
			expect(mockRes.redirect).toHaveBeenCalledWith('http://localhost?token=xxx');
		});

		it('appleLogin が失敗した場合は auth_failed リダイレクトへ', async () => {
			mockOAuthService.appleLogin.mockRejectedValue(new AppException('AUTHZ005', 400));
			const mockReq = {
				ip: '10.0.0.1',
				headers: { 'user-agent': 'jest' },
				user: { appleId: 'apple-new', name: 'New User', email: undefined },
			};
			const mockRes = { redirect: jest.fn() };

			await controller.appleAuthCallback(mockReq as never, mockRes as never);

			expect(mockRes.redirect).toHaveBeenCalledWith('http://localhost?error=auth_failed');
			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				'oauth_callback_failed',
				expect.objectContaining({
					tags: expect.objectContaining({
						feature_area: 'invitation',
						invitation_failure_code: 'AUTHZ005',
					}) as unknown,
				}),
			);
		});
	});

	// ─── Task 9.1: 旧 register-with-invitation 5 本の削除確認 ──────────────

	describe('旧 register-with-invitation ハンドラ削除', () => {
		it.each([
			'googleRegisterWithInvitation',
			'githubRegisterWithInvitation',
			'lineRegisterWithInvitation',
			'appleRegisterWithInvitation',
			'xRegisterWithInvitation',
		])('controller.%s が AuthController から削除されている', (method) => {
			expect((controller as unknown as Record<string, unknown>)[method]).toBeUndefined();
		});
	});

	// ─── Google callback with state ─────────────────────────────────────────

	describe('Google callback with state', () => {
		const validState = 'valid.state';

		beforeEach(() => {
			(Sentry.captureMessage as jest.Mock).mockClear();
		});

		it('state クエリありで verifyState 成功 → googleRegisterWithStateInvitation を呼び success redirect', async () => {
			mockOAuthStateService.verifyState.mockReturnValue({
				v: 1,
				code: 'ABCD1234',
				provider: 'google',
				nonce: 'nonce',
				iat: Date.now(),
			});
			mockOAuthService.googleRegisterWithStateInvitation.mockResolvedValue(oauthLoginResult);

			const req = {
				...buildReq(),
				query: { state: validState },
				user: { googleId: 'g-1', name: 'G', email: 'g@example.com' },
			};
			const res = buildRes();

			await controller.googleAuthRedirect(req as never, res as never);

			expect(mockOAuthStateService.verifyState).toHaveBeenCalledWith(validState, 'google');
			expect(mockOAuthService.googleRegisterWithStateInvitation).toHaveBeenCalledWith(
				expect.objectContaining({ invitationCode: 'ABCD1234' }),
			);
			expect(mockOAuthService.googleLogin).not.toHaveBeenCalled();
			expect(mockRefreshCookieHelper.setRefreshCookie).toHaveBeenCalled();
			expect(res.redirect).toHaveBeenCalledWith('http://localhost?token=xxx');
		});

		it('state あり verify 失敗 + invitationCode 復号不可 → auth_failed + Sentry.captureMessage', async () => {
			mockOAuthStateService.verifyState.mockImplementation(() => {
				throw new AppException('INV001', 400);
			});
			mockOAuthStateService.tryExtractInvitationCode.mockReturnValue('');

			const req = {
				...buildReq(),
				query: { state: 'tampered.state' },
				user: { googleId: 'g-1', name: 'G' },
			};
			const res = buildRes();

			await controller.googleAuthRedirect(req as never, res as never);

			expect(mockOAuthService.googleRegisterWithStateInvitation).not.toHaveBeenCalled();
			expect(mockOAuthService.googleLogin).not.toHaveBeenCalled();
			// 招待コードが無いのに invite ページへ送ると `/invite/?error=invalid_state` という
			// ルートに一致しない URL になるため、auth_failed へ送る（X 経路と同じ扱い）。
			expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('error=auth_failed'));
			expect(res.redirect).not.toHaveBeenCalledWith(expect.stringContaining('invalid_state'));
			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				'invitation_state_invalid',
				expect.objectContaining({
					tags: expect.objectContaining({
						feature_area: 'invitation',
						invitation_failure_code: 'INV001',
					}) as unknown,
				}),
			);
		});

		it('state あり verify 失敗 + invitationCode 復号可 → invite ページへリダイレクト', async () => {
			mockOAuthStateService.verifyState.mockImplementation(() => {
				throw new AppException('INV001', 400);
			});
			mockOAuthStateService.tryExtractInvitationCode.mockReturnValue('GOOGLE-INV');

			const req = {
				...buildReq(),
				query: { state: 'tampered.state' },
				user: { googleId: 'g-1', name: 'G' },
			};
			const res = buildRes();

			await controller.googleAuthRedirect(req as never, res as never);

			expect(mockOAuthService.googleLogin).not.toHaveBeenCalled();
			expect(res.redirect).toHaveBeenCalledWith(
				'http://localhost/invite/GOOGLE-INV?error=invalid_state',
			);
		});

		it('state なし → 既存 googleLogin パスを維持', async () => {
			mockOAuthService.googleLogin.mockResolvedValue(oauthLoginResult);

			const req = {
				...buildReq(),
				query: {},
				user: { googleId: 'g-1', name: 'G', email: 'g@example.com' },
			};
			const res = buildRes();

			await controller.googleAuthRedirect(req as never, res as never);

			expect(mockOAuthStateService.verifyState).not.toHaveBeenCalled();
			expect(mockOAuthService.googleLogin).toHaveBeenCalled();
			expect(res.redirect).toHaveBeenCalledWith('http://localhost?token=xxx');
		});
	});

	describe('Apple callback with body.state', () => {
		it('body.state が存在すれば appleRegisterWithStateInvitation 経路に進むこと', async () => {
			mockOAuthStateService.verifyState.mockReturnValue({
				v: 1,
				code: 'CODE12345',
				provider: 'apple',
				nonce: 'nonce',
				iat: Date.now(),
			});
			mockOAuthService.appleRegisterWithStateInvitation.mockResolvedValue(oauthLoginResult);

			const req = {
				...buildReq(),
				query: {},
				body: { state: 'apple.signed.state' },
				user: { appleId: 'a-1', name: 'A', email: 'a@example.com' },
			};
			const res = buildRes();

			await controller.appleAuthCallback(req as never, res as never);

			expect(mockOAuthStateService.verifyState).toHaveBeenCalledWith('apple.signed.state', 'apple');
			expect(mockOAuthService.appleRegisterWithStateInvitation).toHaveBeenCalled();
			expect(res.redirect).toHaveBeenCalledWith('http://localhost?token=xxx');
		});
	});

	// ─── X コールバック（ステートレスフロー）────────────────────────────────

	describe('xAuthCallback - ステートレスフロー（Phase 2）', () => {
		const VALID_STATE_PAYLOAD = {
			v: 1 as const,
			provider: 'x' as const,
			nonce: 'abc',
			iat: Date.now(),
			verifier: 'plaintext-verifier-43chars-aaaaaaaaaaaaaaaaaaa',
		};

		beforeEach(() => {
			(Sentry.captureMessage as jest.Mock).mockClear();
		});

		it('state + code → verifyState → exchangeCodeForUser → xLogin → success redirect', async () => {
			mockOAuthStateService.verifyState.mockReturnValue(VALID_STATE_PAYLOAD);
			mockXOAuthService.exchangeCodeForUser.mockResolvedValue({
				xId: 'x-123',
				name: 'X User',
				accessToken: 'x-access-token',
			});
			mockOAuthService.xLogin.mockResolvedValue(oauthLoginResult);

			const req = {
				...buildReq(),
				query: { state: 'valid.signed.state', code: 'auth-code' },
			};
			const res = buildRes();

			await controller.xAuthCallback(req as never, res as never);

			expect(mockOAuthStateService.verifyState).toHaveBeenCalledWith('valid.signed.state', 'x');
			expect(mockXOAuthService.exchangeCodeForUser).toHaveBeenCalledWith({
				code: 'auth-code',
				verifier: 'plaintext-verifier-43chars-aaaaaaaaaaaaaaaaaaa',
			});
			expect(mockOAuthService.xLogin).toHaveBeenCalled();
			expect(mockOAuthService.xRegisterWithStateInvitation).not.toHaveBeenCalled();
			expect(mockRefreshCookieHelper.setRefreshCookie).toHaveBeenCalled();
			expect(res.redirect).toHaveBeenCalledWith('http://localhost?token=xxx');
		});

		it('payload に code あり → xRegisterWithStateInvitation を呼ぶこと', async () => {
			mockOAuthStateService.verifyState.mockReturnValue({
				...VALID_STATE_PAYLOAD,
				code: 'INV-CODE-123',
			});
			mockXOAuthService.exchangeCodeForUser.mockResolvedValue({
				xId: 'x-123',
				name: 'X User',
				accessToken: 'x-tok',
			});
			mockOAuthService.xRegisterWithStateInvitation.mockResolvedValue(oauthLoginResult);

			const req = {
				...buildReq(),
				query: { state: 'valid.signed.state', code: 'auth-code' },
			};
			const res = buildRes();

			await controller.xAuthCallback(req as never, res as never);

			expect(mockOAuthService.xRegisterWithStateInvitation).toHaveBeenCalledWith(
				expect.objectContaining({ invitationCode: 'INV-CODE-123' }),
			);
			expect(mockOAuthService.xLogin).not.toHaveBeenCalled();
			expect(res.redirect).toHaveBeenCalledWith('http://localhost?token=xxx');
		});

		it('state クエリなし → auth_failed リダイレクト', async () => {
			const req = { ...buildReq(), query: { code: 'auth-code' } };
			const res = buildRes();

			await controller.xAuthCallback(req as never, res as never);

			expect(mockOAuthStateService.verifyState).not.toHaveBeenCalled();
			expect(res.redirect).toHaveBeenCalledWith('http://localhost?error=auth_failed');
		});

		it('code クエリなし → auth_failed リダイレクト', async () => {
			const req = { ...buildReq(), query: { state: 'valid.state' } };
			const res = buildRes();

			await controller.xAuthCallback(req as never, res as never);

			expect(res.redirect).toHaveBeenCalledWith('http://localhost?error=auth_failed');
		});

		it('verifyState 失敗 + invitationCode 復号可 → invite ページへリダイレクト', async () => {
			mockOAuthStateService.verifyState.mockImplementation(() => {
				throw new AppException('INV001', 400);
			});
			mockOAuthStateService.tryExtractInvitationCode.mockReturnValue('INVITE-CODE');

			const req = { ...buildReq(), query: { state: 'tampered.state', code: 'c' } };
			const res = buildRes();

			await controller.xAuthCallback(req as never, res as never);

			expect(res.redirect).toHaveBeenCalledWith(
				'http://localhost/invite/INVITE-CODE?error=invalid_state',
			);
			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				'invitation_state_invalid',
				expect.anything(),
			);
		});

		it('verifyState 失敗 + invitationCode 復号不可 → auth_failed リダイレクト', async () => {
			mockOAuthStateService.verifyState.mockImplementation(() => {
				throw new AppException('INV001', 400);
			});
			mockOAuthStateService.tryExtractInvitationCode.mockReturnValue(null);

			const req = { ...buildReq(), query: { state: 'tampered.state', code: 'c' } };
			const res = buildRes();

			await controller.xAuthCallback(req as never, res as never);

			expect(res.redirect).toHaveBeenCalledWith('http://localhost?error=auth_failed');
		});

		it('exchangeCodeForUser 失敗 → auth_failed リダイレクト', async () => {
			mockOAuthStateService.verifyState.mockReturnValue(VALID_STATE_PAYLOAD);
			mockXOAuthService.exchangeCodeForUser.mockRejectedValue(new Error('token fetch failed'));

			const req = { ...buildReq(), query: { state: 'valid.state', code: 'c' } };
			const res = buildRes();

			await controller.xAuthCallback(req as never, res as never);

			expect(res.redirect).toHaveBeenCalledWith('http://localhost?error=auth_failed');
		});

		it('xLogin 失敗 → auth_failed リダイレクト', async () => {
			mockOAuthStateService.verifyState.mockReturnValue(VALID_STATE_PAYLOAD);
			mockXOAuthService.exchangeCodeForUser.mockResolvedValue({ xId: 'x-1', name: 'X' });
			mockOAuthService.xLogin.mockRejectedValue(new Error('login failed'));

			const req = { ...buildReq(), query: { state: 'valid.state', code: 'c' } };
			const res = buildRes();

			await controller.xAuthCallback(req as never, res as never);

			expect(res.redirect).toHaveBeenCalledWith('http://localhost?error=auth_failed');
		});
	});

	// ─── getMe ──────────────────────────────────────────────────────────────

	describe('getMe', () => {
		it('findUserById を req.user.id で呼び出すこと', async () => {
			mockAuthService.findUserById.mockResolvedValue({
				id: 'user-3',
				email: 'u3@example.com',
				name: null,
				role: 'USER',
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const req = { user: { id: 'user-3', email: 'u3@example.com', role: 'USER' } };
			await controller.getMe(req as never);

			expect(mockAuthService.findUserById).toHaveBeenCalledWith('user-3');
		});
	});

	// ─── startOAuthRegistration ─────────────────────────────────────────────

	describe('startOAuthRegistration', () => {
		it('招待コード検証 → state 発行 → authorizationUrl を返すこと（google）', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ code: 'ABCD1234' });

			const result = await controller.startOAuthRegistration(
				{ provider: 'google' },
				{ invitationCode: 'ABCD1234' },
			);

			expect(mockInvitationService.verifyInvitation).toHaveBeenCalledWith('ABCD1234');
			expect(mockOAuthStateService.issueState).toHaveBeenCalledWith({
				provider: 'google',
				code: 'ABCD1234',
			});
			expect(mockConfigService.generateOAuthAuthorizationUrl).toHaveBeenCalledWith(
				'google',
				'signed.state',
			);
			expect(result.authorizationUrl).toBe('https://oauth.example.com/google?state=signed.state');
		});

		it('verifyInvitation が失敗した場合は authorizationUrl を返さず例外を伝播すること', async () => {
			mockInvitationService.verifyInvitation.mockRejectedValue(
				new AppException('INV001', 400, 'invalid'),
			);

			await expect(
				controller.startOAuthRegistration({ provider: 'google' }, { invitationCode: 'BADCODE12' }),
			).rejects.toBeInstanceOf(AppException);
			expect(mockOAuthStateService.issueState).not.toHaveBeenCalled();
		});

		it.each(['google', 'apple'] as const)(
			'%s プロバイダで generateOAuthAuthorizationUrl を呼ぶこと',
			async (provider) => {
				mockInvitationService.verifyInvitation.mockResolvedValue({ code: 'ABCD1234' });

				const result = await controller.startOAuthRegistration(
					{ provider },
					{ invitationCode: 'ABCD1234' },
				);

				expect(mockOAuthStateService.issueState).toHaveBeenCalledWith({
					provider,
					code: 'ABCD1234',
				});
				expect(mockConfigService.generateOAuthAuthorizationUrl).toHaveBeenCalledWith(
					provider,
					'signed.state',
				);
				expect(result.authorizationUrl).toContain(provider);
			},
		);

		it('x プロバイダでは PKCE pair を生成して verifier を封緘・challenge を authorize URL に載せること', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ code: 'ABCD1234' });
			mockConfigService.generateOAuthAuthorizationUrl.mockReturnValue(
				'https://twitter.com/i/oauth2/authorize?state=signed.state&code_challenge=mock-challenge',
			);

			const result = await controller.startOAuthRegistration(
				{ provider: 'x' },
				{ invitationCode: 'ABCD1234' },
			);

			expect(mockOAuthStateService.issueState).toHaveBeenCalledWith({
				provider: 'x',
				code: 'ABCD1234',
				verifier: 'mock-verifier-43chars-aaaaaaaaaaaaaaaaaaaa',
			});
			expect(mockConfigService.generateOAuthAuthorizationUrl).toHaveBeenCalledWith(
				'x',
				'signed.state',
				'mock-challenge-43chars-aaaaaaaaaaaaaaaaaaaaa',
			);
			expect(result.authorizationUrl).toContain('twitter.com');
		});
	});
});

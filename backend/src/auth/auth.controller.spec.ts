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
import { InvitationStateService } from './invitation-state.service';
import * as Sentry from '@sentry/nestjs';
import { AppException } from '../common/exceptions';

jest.mock('@sentry/nestjs', () => ({
	captureMessage: jest.fn(),
}));

describe('AuthController - LINE / Apple / X エンドポイント', () => {
	let controller: AuthController;

	const mockOAuthService = {
		lineLogin: jest.fn(),
		appleLogin: jest.fn(),
		xLogin: jest.fn(),
		googleLogin: jest.fn(),
		githubLogin: jest.fn(),
		googleRegisterWithStateInvitation: jest.fn(),
		githubRegisterWithStateInvitation: jest.fn(),
		lineRegisterWithStateInvitation: jest.fn(),
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

	const mockInvitationStateService = {
		issueState: jest.fn().mockReturnValue('signed.state'),
		verifyState: jest.fn(),
	};

	const mockAuthService = {
		findUserById: jest.fn(),
		register: jest.fn(),
		registerWithTokens: jest.fn(),
		login: jest.fn(),
		comparePassword: jest.fn(),
		hashPassword: jest.fn(),
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
	const buildRes = () => ({ cookie: jest.fn(), redirect: jest.fn(), clearCookie: jest.fn() });

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
				{ provide: InvitationStateService, useValue: mockInvitationStateService },
			],
		}).compile();

		controller = module.get<AuthController>(AuthController);
		jest.clearAllMocks();
		mockInvitationStateService.issueState.mockReturnValue('signed.state');
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

	// ─── コールバック（Apple POST / X GET）───────────────────────────────────

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

		it('新フローでは appleLogin が失敗しても invitation_required リダイレクトせず auth_failed へ', async () => {
			// Task 9.1: 旧 INVITATION_REQUIRED 経路を撤去したため、admin 以外の新規ユーザーが
			// state なしで callback に到達した場合は ADMIN_EMAIL_REQUIRED で弾かれ auth_failed リダイレクトとなる。
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

	describe('xAuthCallback (GET /auth/x/callback)', () => {
		it('X認証成功時にCookie設定とsuccessリダイレクトを行うこと', async () => {
			mockOAuthService.xLogin.mockResolvedValue(oauthLoginResult);
			const mockReq = {
				ip: '10.0.0.1',
				headers: { 'user-agent': 'jest' },
				user: { xId: '1234', name: 'X User' },
			};
			const mockRes = { redirect: jest.fn() };

			await controller.xAuthCallback(mockReq as never, mockRes as never);

			expect(mockRefreshCookieHelper.setRefreshCookie).toHaveBeenCalled();
			expect(mockRes.redirect).toHaveBeenCalledWith('http://localhost?token=xxx');
		});

		it('認証エラー時にauth_failedリダイレクトURLへリダイレクトすること', async () => {
			mockOAuthService.xLogin.mockRejectedValue(new Error('OAuth error'));
			const mockReq = {
				ip: '10.0.0.1',
				headers: { 'user-agent': 'jest' },
				user: { xId: '1234', name: 'X User' },
			};
			const mockRes = { redirect: jest.fn() };

			await controller.xAuthCallback(mockReq as never, mockRes as never);

			expect(mockRes.redirect).toHaveBeenCalledWith('http://localhost?error=auth_failed');
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

	// ─── Task 5.3: POST /auth/oauth/:provider/start ─────────────────────────

	// ─── Task 5.4: OAuth callback with state-verified register ──────────────

	describe('Google callback with state', () => {
		const validState = 'valid.state';

		beforeEach(() => {
			(Sentry.captureMessage as jest.Mock).mockClear();
		});

		it('state クエリありで verifyState 成功 → googleRegisterWithStateInvitation を呼び success redirect', async () => {
			mockInvitationStateService.verifyState.mockReturnValue({
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

			expect(mockInvitationStateService.verifyState).toHaveBeenCalledWith(validState, 'google');
			expect(mockOAuthService.googleRegisterWithStateInvitation).toHaveBeenCalledWith(
				expect.objectContaining({ invitationCode: 'ABCD1234' }),
			);
			expect(mockOAuthService.googleLogin).not.toHaveBeenCalled();
			expect(mockRefreshCookieHelper.setRefreshCookie).toHaveBeenCalled();
			expect(res.redirect).toHaveBeenCalledWith('http://localhost?token=xxx');
		});

		it('state あり verify 失敗 → invalid_state redirect + Sentry.captureMessage', async () => {
			mockInvitationStateService.verifyState.mockImplementation(() => {
				throw new AppException('INV001', 400);
			});

			const req = {
				...buildReq(),
				query: { state: 'tampered.state' },
				user: { googleId: 'g-1', name: 'G' },
			};
			const res = buildRes();

			await controller.googleAuthRedirect(req as never, res as never);

			expect(mockOAuthService.googleRegisterWithStateInvitation).not.toHaveBeenCalled();
			expect(mockOAuthService.googleLogin).not.toHaveBeenCalled();
			expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('error=invalid_state'));
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

		it('state なし → 既存 googleLogin パスを維持', async () => {
			mockOAuthService.googleLogin.mockResolvedValue(oauthLoginResult);

			const req = {
				...buildReq(),
				query: {},
				user: { googleId: 'g-1', name: 'G', email: 'g@example.com' },
			};
			const res = buildRes();

			await controller.googleAuthRedirect(req as never, res as never);

			expect(mockInvitationStateService.verifyState).not.toHaveBeenCalled();
			expect(mockOAuthService.googleLogin).toHaveBeenCalled();
			expect(res.redirect).toHaveBeenCalledWith('http://localhost?token=xxx');
		});
	});

	describe('Apple callback with body.state', () => {
		it('body.state が存在すれば appleRegisterWithStateInvitation 経路に進むこと', async () => {
			mockInvitationStateService.verifyState.mockReturnValue({
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

			expect(mockInvitationStateService.verifyState).toHaveBeenCalledWith(
				'apple.signed.state',
				'apple',
			);
			expect(mockOAuthService.appleRegisterWithStateInvitation).toHaveBeenCalled();
			expect(res.redirect).toHaveBeenCalledWith('http://localhost?token=xxx');
		});
	});

	describe.each([
		['github', 'githubAuthRedirect', 'githubRegisterWithStateInvitation', 'githubLogin'],
		['line', 'lineAuthCallback', 'lineRegisterWithStateInvitation', 'lineLogin'],
		['x', 'xAuthCallback', 'xRegisterWithStateInvitation', 'xLogin'],
	] as const)('%s callback with state', (provider, handler, stateMethod, loginMethod) => {
		it('state あり成功時に *RegisterWithStateInvitation を呼び success redirect', async () => {
			mockInvitationStateService.verifyState.mockReturnValue({
				code: 'CODE12345',
				provider,
				nonce: 'nonce',
				iat: Date.now(),
			});
			mockOAuthService[stateMethod].mockResolvedValue(oauthLoginResult);

			const userByProvider: Record<string, Record<string, unknown>> = {
				github: { githubId: 'gh-1', name: 'GH' },
				line: { lineId: 'U1', name: 'L', email: 'l@example.com' },
				x: { xId: 'x-1', name: 'X' },
			};

			const req = {
				...buildReq(),
				query: { state: 'signed.state' },
				user: userByProvider[provider],
			};
			const res = buildRes();

			await (controller as unknown as Record<string, (...args: unknown[]) => Promise<void>>)[
				handler
			](req, res);

			expect(mockInvitationStateService.verifyState).toHaveBeenCalledWith('signed.state', provider);
			expect(mockOAuthService[stateMethod]).toHaveBeenCalled();
			expect(mockOAuthService[loginMethod]).not.toHaveBeenCalled();
			expect(res.redirect).toHaveBeenCalledWith('http://localhost?token=xxx');
		});
	});

	describe('startOAuthRegistration', () => {
		it('招待コード検証 → state 発行 → authorizationUrl を返すこと', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ code: 'ABCD1234' });
			mockInvitationStateService.issueState.mockReturnValue('signed.state');

			const result = await controller.startOAuthRegistration(
				{ provider: 'google' },
				{ invitationCode: 'ABCD1234' },
			);

			expect(mockInvitationService.verifyInvitation).toHaveBeenCalledWith('ABCD1234');
			expect(mockInvitationStateService.issueState).toHaveBeenCalledWith('ABCD1234', 'google');
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
			expect(mockInvitationStateService.issueState).not.toHaveBeenCalled();
			expect(mockConfigService.generateOAuthAuthorizationUrl).not.toHaveBeenCalled();
		});

		it.each(['google', 'github', 'line', 'apple', 'x'] as const)(
			'%s プロバイダで authorizationUrl を組み立てること',
			async (provider) => {
				mockInvitationService.verifyInvitation.mockResolvedValue({ code: 'ABCD1234' });

				const result = await controller.startOAuthRegistration(
					{ provider },
					{ invitationCode: 'ABCD1234' },
				);

				expect(mockInvitationStateService.issueState).toHaveBeenCalledWith('ABCD1234', provider);
				expect(result.authorizationUrl).toContain(provider);
			},
		);
	});
});

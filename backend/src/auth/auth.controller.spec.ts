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
import { AppException } from '../common/exceptions';

describe('AuthController - LINE / Apple / X エンドポイント', () => {
	let controller: AuthController;

	const mockOAuthService = {
		lineLogin: jest.fn(),
		lineRegisterWithInvitation: jest.fn(),
		appleLogin: jest.fn(),
		appleRegisterWithInvitation: jest.fn(),
		xLogin: jest.fn(),
		xRegisterWithInvitation: jest.fn(),
		googleLogin: jest.fn(),
		githubLogin: jest.fn(),
		googleRegisterWithInvitation: jest.fn(),
		githubRegisterWithInvitation: jest.fn(),
	};

	const mockConfigService = {
		generateSuccessRedirectUrl: jest.fn().mockReturnValue('http://localhost?token=xxx'),
		generateInvitationRequiredUrl: jest
			.fn()
			.mockReturnValue('http://localhost?error=invitation_required'),
		generateAuthFailedUrl: jest.fn().mockReturnValue('http://localhost?error=auth_failed'),
		adminEmail: undefined,
		isAdminEmail: jest.fn().mockReturnValue(false),
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
			],
		}).compile();

		controller = module.get<AuthController>(AuthController);
		jest.clearAllMocks();
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

	// ─── LINE ───────────────────────────────────────────────────────────────

	describe('lineRegisterWithInvitation', () => {
		it('有効な lineUser と invitationCode で登録に成功し Cookie を設定すること', async () => {
			mockOAuthService.lineRegisterWithInvitation.mockResolvedValue(oauthLoginResult);

			const result = await controller.lineRegisterWithInvitation(
				{
					lineUser: { lineId: 'U1234', name: 'LINE User', email: 'line@example.com' },
					invitationCode: 'CODE123',
				},
				buildReq() as never,
				buildRes() as never,
			);

			expect(result).toMatchObject({
				message: 'Registration successful',
				accessToken: 'jwt-token',
			});
			expect(mockOAuthService.lineRegisterWithInvitation).toHaveBeenCalled();
			expect(mockRefreshCookieHelper.setRefreshCookie).toHaveBeenCalled();
		});

		it('lineId が未指定の場合に BadRequest をスローすること', async () => {
			await expect(
				controller.lineRegisterWithInvitation(
					{
						lineUser: { name: 'LINE User' },
						invitationCode: 'CODE123',
					},
					buildReq() as never,
					buildRes() as never,
				),
			).rejects.toBeInstanceOf(AppException);
		});
	});

	// ─── Apple ──────────────────────────────────────────────────────────────

	describe('appleRegisterWithInvitation', () => {
		it('有効な appleUser と invitationCode で登録に成功し Cookie を設定すること', async () => {
			mockOAuthService.appleRegisterWithInvitation.mockResolvedValue(oauthLoginResult);

			const result = await controller.appleRegisterWithInvitation(
				{
					appleUser: { appleId: 'sub-id', name: 'Apple User' },
					invitationCode: 'CODE123',
					fallbackEmail: 'apple@example.com',
				},
				buildReq() as never,
				buildRes() as never,
			);

			expect(result).toMatchObject({ message: 'Registration successful' });
			expect(mockRefreshCookieHelper.setRefreshCookie).toHaveBeenCalled();
		});

		it('appleId が未指定の場合に BadRequest をスローすること', async () => {
			await expect(
				controller.appleRegisterWithInvitation(
					{
						appleUser: { name: 'Apple User' },
						invitationCode: 'CODE123',
					},
					buildReq() as never,
					buildRes() as never,
				),
			).rejects.toBeInstanceOf(AppException);
		});
	});

	// ─── X ──────────────────────────────────────────────────────────────────

	describe('xRegisterWithInvitation', () => {
		it('有効な xUser と invitationCode で登録に成功し Cookie を設定すること', async () => {
			mockOAuthService.xRegisterWithInvitation.mockResolvedValue(oauthLoginResult);

			const result = await controller.xRegisterWithInvitation(
				{
					xUser: { xId: '1234', name: 'X User' },
					invitationCode: 'CODE123',
				},
				buildReq() as never,
				buildRes() as never,
			);

			expect(result).toMatchObject({ message: 'Registration successful' });
			expect(mockRefreshCookieHelper.setRefreshCookie).toHaveBeenCalled();
		});

		it('xId が未指定の場合に BadRequest をスローすること', async () => {
			await expect(
				controller.xRegisterWithInvitation(
					{
						xUser: { name: 'X User' },
						invitationCode: 'CODE123',
					},
					buildReq() as never,
					buildRes() as never,
				),
			).rejects.toBeInstanceOf(AppException);
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

		it('新規ユーザーの場合にinvitation_requiredリダイレクトURLへリダイレクトすること', async () => {
			mockOAuthService.appleLogin.mockRejectedValue(new Error('Please provide invitation code'));
			const mockReq = {
				ip: '10.0.0.1',
				headers: { 'user-agent': 'jest' },
				user: { appleId: 'apple-new', name: 'New User', email: undefined },
			};
			const mockRes = { redirect: jest.fn() };

			await controller.appleAuthCallback(mockReq as never, mockRes as never);

			expect(mockRes.redirect).toHaveBeenCalledWith('http://localhost?error=invitation_required');
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

	// ─── Prisma ユニーク制約違反 ───────────────────────────────────────────

	describe('Prisma unique constraint violation handling', () => {
		it('lineId が重複している場合に AppException をスローすること', async () => {
			const prismaError = new Error('Unique constraint failed on the fields: (`line_id`)');
			mockOAuthService.lineRegisterWithInvitation.mockRejectedValue(prismaError);

			await expect(
				controller.lineRegisterWithInvitation(
					{
						lineUser: { lineId: 'U1234', name: 'LINE User' },
						invitationCode: 'CODE123',
					},
					buildReq() as never,
					buildRes() as never,
				),
			).rejects.toBeInstanceOf(AppException);
		});

		it('appleId が重複している場合に AppException をスローすること', async () => {
			const prismaError = new Error('Unique constraint failed on the fields: (`apple_id`)');
			mockOAuthService.appleRegisterWithInvitation.mockRejectedValue(prismaError);

			await expect(
				controller.appleRegisterWithInvitation(
					{
						appleUser: { appleId: 'apple-dup', name: 'Apple User' },
						invitationCode: 'CODE123',
					},
					buildReq() as never,
					buildRes() as never,
				),
			).rejects.toBeInstanceOf(AppException);
		});

		it('xId が重複している場合に AppException をスローすること', async () => {
			const prismaError = new Error('Unique constraint failed on the fields: (`x_id`)');
			mockOAuthService.xRegisterWithInvitation.mockRejectedValue(prismaError);

			await expect(
				controller.xRegisterWithInvitation(
					{
						xUser: { xId: 'x-dup', name: 'X User' },
						invitationCode: 'CODE123',
					},
					buildReq() as never,
					buildRes() as never,
				),
			).rejects.toBeInstanceOf(AppException);
		});
	});
});

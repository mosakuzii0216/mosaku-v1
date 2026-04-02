import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { InvitationService } from '../invitation/invitation.service';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
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
		login: jest.fn(),
		comparePassword: jest.fn(),
		hashPassword: jest.fn(),
	};

	const mockInvitationService = { verifyInvitation: jest.fn(), useInvitation: jest.fn() };
	const mockPrismaService = { user: { findUnique: jest.fn(), update: jest.fn() } };

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [AuthController],
			providers: [
				{ provide: AuthService, useValue: mockAuthService },
				{ provide: OAuthService, useValue: mockOAuthService },
				{ provide: InvitationService, useValue: mockInvitationService },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: PrismaService, useValue: mockPrismaService },
			],
		}).compile();

		controller = module.get<AuthController>(AuthController);
		jest.clearAllMocks();
	});

	it('AuthController が定義されていること', () => {
		expect(controller).toBeDefined();
	});

	// ─── LINE ───────────────────────────────────────────────────────────────

	describe('lineRegisterWithInvitation', () => {
		it('有効な lineUser と invitationCode で登録に成功すること', async () => {
			mockOAuthService.lineRegisterWithInvitation.mockResolvedValue({
				accessToken: 'jwt-token',
				user: { id: '1', name: 'LINE User' },
			});

			const result = await controller.lineRegisterWithInvitation({
				lineUser: { lineId: 'U1234', name: 'LINE User', email: 'line@example.com' },
				invitationCode: 'CODE123',
			});

			expect(result).toMatchObject({ message: 'Registration successful' });
			expect(mockOAuthService.lineRegisterWithInvitation).toHaveBeenCalled();
		});

		it('lineId が未指定の場合に BadRequest をスローすること', async () => {
			await expect(
				controller.lineRegisterWithInvitation({
					lineUser: { name: 'LINE User' },
					invitationCode: 'CODE123',
				}),
			).rejects.toBeInstanceOf(AppException);
		});
	});

	// ─── Apple ──────────────────────────────────────────────────────────────

	describe('appleRegisterWithInvitation', () => {
		it('有効な appleUser と invitationCode で登録に成功すること', async () => {
			mockOAuthService.appleRegisterWithInvitation.mockResolvedValue({
				accessToken: 'jwt-token',
				user: { id: '1', name: 'Apple User' },
			});

			const result = await controller.appleRegisterWithInvitation({
				appleUser: { appleId: 'sub-id', name: 'Apple User' },
				invitationCode: 'CODE123',
				fallbackEmail: 'apple@example.com',
			});

			expect(result).toMatchObject({ message: 'Registration successful' });
		});

		it('appleId が未指定の場合に BadRequest をスローすること', async () => {
			await expect(
				controller.appleRegisterWithInvitation({
					appleUser: { name: 'Apple User' },
					invitationCode: 'CODE123',
				}),
			).rejects.toBeInstanceOf(AppException);
		});
	});

	// ─── X ──────────────────────────────────────────────────────────────────

	describe('xRegisterWithInvitation', () => {
		it('有効な xUser と invitationCode で登録に成功すること', async () => {
			mockOAuthService.xRegisterWithInvitation.mockResolvedValue({
				accessToken: 'jwt-token',
				user: { id: '1', name: 'X User' },
			});

			const result = await controller.xRegisterWithInvitation({
				xUser: { xId: '1234', name: 'X User' },
				invitationCode: 'CODE123',
			});

			expect(result).toMatchObject({ message: 'Registration successful' });
		});

		it('xId が未指定の場合に BadRequest をスローすること', async () => {
			await expect(
				controller.xRegisterWithInvitation({
					xUser: { name: 'X User' },
					invitationCode: 'CODE123',
				}),
			).rejects.toBeInstanceOf(AppException);
		});
	});

	// ─── コールバック（Apple POST / X GET）───────────────────────────────────

	describe('appleAuthCallback (POST /auth/apple/callback)', () => {
		it('Apple認証成功時にsuccessリダイレクトURLへリダイレクトすること', async () => {
			mockOAuthService.appleLogin.mockResolvedValue({
				accessToken: 'jwt-apple',
				user: { id: '1', name: 'Apple User' },
			});
			const mockReq = {
				user: { appleId: 'apple-sub', name: 'Apple User', email: 'a@example.com' },
			};
			const mockRes = { redirect: jest.fn() };

			await controller.appleAuthCallback(mockReq as never, mockRes as never);

			expect(mockRes.redirect).toHaveBeenCalledWith('http://localhost?token=xxx');
		});

		it('新規ユーザーの場合にinvitation_requiredリダイレクトURLへリダイレクトすること', async () => {
			mockOAuthService.appleLogin.mockRejectedValue(new Error('Please provide invitation code'));
			const mockReq = { user: { appleId: 'apple-new', name: 'New User', email: undefined } };
			const mockRes = { redirect: jest.fn() };

			await controller.appleAuthCallback(mockReq as never, mockRes as never);

			expect(mockRes.redirect).toHaveBeenCalledWith('http://localhost?error=invitation_required');
		});
	});

	describe('xAuthCallback (GET /auth/x/callback)', () => {
		it('X認証成功時にsuccessリダイレクトURLへリダイレクトすること', async () => {
			mockOAuthService.xLogin.mockResolvedValue({
				accessToken: 'jwt-x',
				user: { id: '1', name: 'X User' },
			});
			const mockReq = { user: { xId: '1234', name: 'X User' } };
			const mockRes = { redirect: jest.fn() };

			await controller.xAuthCallback(mockReq as never, mockRes as never);

			expect(mockRes.redirect).toHaveBeenCalledWith('http://localhost?token=xxx');
		});

		it('認証エラー時にauth_failedリダイレクトURLへリダイレクトすること', async () => {
			mockOAuthService.xLogin.mockRejectedValue(new Error('OAuth error'));
			const mockReq = { user: { xId: '1234', name: 'X User' } };
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
				controller.lineRegisterWithInvitation({
					lineUser: { lineId: 'U1234', name: 'LINE User' },
					invitationCode: 'CODE123',
				}),
			).rejects.toBeInstanceOf(AppException);
		});

		it('appleId が重複している場合に AppException をスローすること', async () => {
			const prismaError = new Error('Unique constraint failed on the fields: (`apple_id`)');
			mockOAuthService.appleRegisterWithInvitation.mockRejectedValue(prismaError);

			await expect(
				controller.appleRegisterWithInvitation({
					appleUser: { appleId: 'apple-dup', name: 'Apple User' },
					invitationCode: 'CODE123',
				}),
			).rejects.toBeInstanceOf(AppException);
		});

		it('xId が重複している場合に AppException をスローすること', async () => {
			const prismaError = new Error('Unique constraint failed on the fields: (`x_id`)');
			mockOAuthService.xRegisterWithInvitation.mockRejectedValue(prismaError);

			await expect(
				controller.xRegisterWithInvitation({
					xUser: { xId: 'x-dup', name: 'X User' },
					invitationCode: 'CODE123',
				}),
			).rejects.toBeInstanceOf(AppException);
		});
	});
});

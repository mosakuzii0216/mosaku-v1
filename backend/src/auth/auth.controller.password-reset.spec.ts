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
import { AppException } from '../common/exceptions/app.exception';
import { ERROR_CODES } from '../common/exceptions';

describe('AuthController - パスワードリセットエンドポイント', () => {
	let controller: AuthController;

	const mockPasswordResetService = {
		requestReset: jest.fn(),
		confirmReset: jest.fn(),
	};

	const mockAuthService = {
		findUserById: jest.fn(),
		registerWithTokens: jest.fn(),
		login: jest.fn(),
		comparePassword: jest.fn(),
		hashPassword: jest.fn(),
	};

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
		generateInvitationStateInvalidUrl: jest.fn(),
		generateOAuthAuthorizationUrl: jest.fn(),
		frontendUrl: 'http://localhost',
		adminEmail: undefined,
		isAdminEmail: jest.fn().mockReturnValue(false),
	};

	const mockOAuthStateService = {
		issueState: jest.fn(),
		verifyState: jest.fn(),
		tryExtractInvitationCode: jest.fn().mockReturnValue(null),
	};

	const mockXOAuthService = {
		isConfigured: jest.fn().mockReturnValue(false),
		exchangeCodeForUser: jest.fn(),
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
	});

	// ─── POST /auth/reset-password ─────────────────────────────────────────────

	describe('POST /auth/reset-password（列挙対策・曖昧レスポンス）', () => {
		it('存在するパスワードユーザーで requestReset を呼び出し共通メッセージを返す', async () => {
			mockPasswordResetService.requestReset.mockResolvedValue(undefined);

			const result = await controller.resetPassword({ email: 'existing@example.com' });

			expect(mockPasswordResetService.requestReset).toHaveBeenCalledWith('existing@example.com');
			expect(result).toHaveProperty('message');
			expect(typeof result.message).toBe('string');
			expect(result.message.length).toBeGreaterThan(0);
		});

		it('存在しないメールでも同一メッセージ・構造を返す（ユーザー列挙対策）', async () => {
			mockPasswordResetService.requestReset.mockResolvedValue(undefined);

			const result1 = await controller.resetPassword({ email: 'existing@example.com' });
			const result2 = await controller.resetPassword({ email: 'notfound@example.com' });

			expect(result1.message).toBe(result2.message);
			expect(Object.keys(result1)).toEqual(Object.keys(result2));
		});

		it('OAuth ユーザー（password=null）でも同一メッセージを返す（ユーザー列挙対策）', async () => {
			mockPasswordResetService.requestReset.mockResolvedValue(undefined);

			const resultPassword = await controller.resetPassword({ email: 'password@example.com' });
			const resultOAuth = await controller.resetPassword({ email: 'oauth@example.com' });

			expect(resultPassword.message).toBe(resultOAuth.message);
		});

		it('MailService 送信失敗（requestReset が void で返る）時も共通 200 メッセージを返す', async () => {
			// requestReset は内部でメール送信失敗を握り潰す設計のため、常に void で返る
			mockPasswordResetService.requestReset.mockResolvedValue(undefined);

			const result = await controller.resetPassword({ email: 'test@example.com' });

			expect(result).toHaveProperty('message');
			expect(typeof result.message).toBe('string');
		});
	});

	// ─── POST /auth/reset-password/confirm ────────────────────────────────────

	describe('POST /auth/reset-password/confirm', () => {
		it('有効トークンで confirmReset を呼び出しパスワード変更成功メッセージを返す', async () => {
			mockPasswordResetService.confirmReset.mockResolvedValue(undefined);

			const result = await controller.resetPasswordConfirm({
				token: 'valid-token-hex',
				newPassword: 'NewPass123',
			});

			expect(mockPasswordResetService.confirmReset).toHaveBeenCalledWith(
				'valid-token-hex',
				'NewPass123',
			);
			expect(result).toHaveProperty('message');
			expect(typeof result.message).toBe('string');
		});

		it('無効トークンで confirmReset が AUTH003 エラーをスローした場合に伝播する', async () => {
			mockPasswordResetService.confirmReset.mockRejectedValue(
				new AppException(ERROR_CODES.AUTH.INVALID_TOKEN, 400),
			);

			await expect(
				controller.resetPasswordConfirm({ token: 'invalid-token', newPassword: 'NewPass123' }),
			).rejects.toMatchObject({ code: ERROR_CODES.AUTH.INVALID_TOKEN });

			expect(mockPasswordResetService.confirmReset).toHaveBeenCalled();
		});

		it('期限切れトークンで confirmReset が AUTH014 エラーをスローした場合に伝播する', async () => {
			mockPasswordResetService.confirmReset.mockRejectedValue(
				new AppException(ERROR_CODES.AUTH.RESET_TOKEN_EXPIRED, 400),
			);

			await expect(
				controller.resetPasswordConfirm({ token: 'expired-token', newPassword: 'NewPass123' }),
			).rejects.toMatchObject({ code: ERROR_CODES.AUTH.RESET_TOKEN_EXPIRED });
		});

		it('使用済みトークン（2 回目）で AUTH003 エラーを伝播する', async () => {
			mockPasswordResetService.confirmReset.mockRejectedValue(
				new AppException(ERROR_CODES.AUTH.INVALID_TOKEN, 400),
			);

			await expect(
				controller.resetPasswordConfirm({
					token: 'already-used-token',
					newPassword: 'NewPass123',
				}),
			).rejects.toMatchObject({ code: ERROR_CODES.AUTH.INVALID_TOKEN });
		});
	});
});

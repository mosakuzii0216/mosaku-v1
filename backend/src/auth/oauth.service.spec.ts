import { Test, TestingModule } from '@nestjs/testing';
import { OAuthService } from './oauth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { InvitationService } from '../invitation/invitation.service';
import { JwtTokenService } from './jwt.service';
import { AppException } from '../common/exceptions';

describe('OAuthService', () => {
	let service: OAuthService;

	const mockUser = {
		id: 'user-id-1',
		email: 'oauth@example.com',
		password: null,
		name: 'OAuth User',
		role: 'USER' as const,
		oauthId: 'provider-id-123',
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		picture: null,
	};

	const mockPrismaService = {
		user: {
			findFirst: jest.fn(),
			create: jest.fn(),
			update: jest.fn(),
		},
	};

	const mockConfigService = {
		isAdminEmail: jest.fn().mockReturnValue(false),
	};

	const mockInvitationService = {
		verifyInvitation: jest.fn(),
		useInvitation: jest.fn(),
	};

	const mockJwtTokenService = {
		generateTokens: jest.fn().mockReturnValue({ accessToken: 'mock-token' }),
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				OAuthService,
				{ provide: PrismaService, useValue: mockPrismaService },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: InvitationService, useValue: mockInvitationService },
				{ provide: JwtTokenService, useValue: mockJwtTokenService },
			],
		}).compile();

		service = module.get<OAuthService>(OAuthService);
		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('handleOAuthLogin', () => {
		const oauthUser = {
			id: 'provider-id-123',
			email: 'oauth@example.com',
			name: 'OAuth User',
			provider: 'google' as const,
		};

		it('should update oauthId/name and return tokens for an existing user', async () => {
			mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
			mockPrismaService.user.update.mockResolvedValue(mockUser);

			const result = await service.handleOAuthLogin(oauthUser, 'provider-id-123');

			expect(mockPrismaService.user.update).toHaveBeenCalled();
			expect(result.accessToken).toBe('mock-token');
			expect(result.user).not.toHaveProperty('password');
		});

		it('should create ADMIN user when email matches admin email', async () => {
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockConfigService.isAdminEmail.mockReturnValue(true);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, role: 'ADMIN' });

			const result = await service.handleOAuthLogin(oauthUser, 'provider-id-123');

			expect(mockPrismaService.user.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ role: 'ADMIN' }) as unknown,
				}),
			);
			expect(result.user).not.toHaveProperty('password');
		});

		it('should throw when a new non-admin user tries to login without invitation', async () => {
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockConfigService.isAdminEmail.mockReturnValue(false);

			await expect(service.handleOAuthLogin(oauthUser, 'provider-id-123')).rejects.toBeInstanceOf(
				AppException,
			);
		});
	});

	describe('handleOAuthRegistrationWithInvitation', () => {
		const oauthUser = {
			id: 'provider-id-456',
			email: 'newuser@example.com',
			name: 'New OAuth User',
			provider: 'google' as const,
		};

		it('should create user and use invitation when everything is valid', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ id: 'invite-1', code: 'CODE123' });
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({
				...mockUser,
				email: oauthUser.email,
				oauthId: oauthUser.id,
			});
			mockConfigService.isAdminEmail.mockReturnValue(false);

			const result = await service.handleOAuthRegistrationWithInvitation(
				oauthUser,
				'provider-id-456',
				'CODE123',
			);

			expect(mockPrismaService.user.create).toHaveBeenCalled();
			expect(mockInvitationService.useInvitation).toHaveBeenCalledWith('CODE123');
			expect(result.user).not.toHaveProperty('password');
		});

		it('should throw when user with same email already exists', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ id: 'invite-1', code: 'CODE123' });
			mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

			await expect(
				service.handleOAuthRegistrationWithInvitation(oauthUser, 'provider-id-456', 'CODE123'),
			).rejects.toBeInstanceOf(AppException);
		});

		it('should throw when no email is provided', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ id: 'invite-1', code: 'CODE123' });
			const noEmailUser = { ...oauthUser, email: undefined };

			await expect(
				service.handleOAuthRegistrationWithInvitation(noEmailUser, 'provider-id-456', 'CODE123'),
			).rejects.toBeInstanceOf(AppException);
		});

		it('should propagate error when invitation is invalid', async () => {
			mockInvitationService.verifyInvitation.mockRejectedValue(new AppException('INV001', 400));

			await expect(
				service.handleOAuthRegistrationWithInvitation(oauthUser, 'provider-id-456', 'INVALID'),
			).rejects.toBeInstanceOf(AppException);
		});
	});

	describe('googleLogin', () => {
		it('should delegate to handleOAuthLogin with googleId as providerId', async () => {
			const googleUser = {
				googleId: 'google-id-789',
				email: 'google@example.com',
				name: 'Google User',
			};
			mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
			mockPrismaService.user.update.mockResolvedValue(mockUser);

			const result = await service.googleLogin(googleUser);

			expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						OR: expect.arrayContaining([{ oauthId: 'google-id-789' }]) as unknown,
					}) as unknown,
				}),
			);
			expect(result.accessToken).toBeDefined();
		});
	});

	describe('githubLogin', () => {
		it('should delegate to handleOAuthLogin with githubId as providerId', async () => {
			const githubUser = {
				githubId: 'github-id-789',
				email: 'github@example.com',
				name: 'GitHub User',
			};
			mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
			mockPrismaService.user.update.mockResolvedValue(mockUser);

			const result = await service.githubLogin(githubUser);

			expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						OR: expect.arrayContaining([{ oauthId: 'github-id-789' }]) as unknown,
					}) as unknown,
				}),
			);
			expect(result.accessToken).toBeDefined();
		});
	});

	// ─── Task 4.1 / 4.2: LINE / Apple / X ───────────────────────────────────

	describe('lineLogin', () => {
		it('lineId フィールドを使ってユーザーを検索すること', async () => {
			const lineUser = { lineId: 'U1234567890', name: 'LINE User', email: 'line@example.com' };
			mockPrismaService.user.findFirst.mockResolvedValue({ ...mockUser, lineId: 'U1234567890' });
			mockPrismaService.user.update.mockResolvedValue({ ...mockUser, lineId: 'U1234567890' });

			const result = await service.lineLogin(lineUser);

			expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						OR: expect.arrayContaining([{ lineId: 'U1234567890' }]) as unknown,
					}) as unknown,
				}),
			);
			expect(result.accessToken).toBeDefined();
		});

		it('新規ユーザーの場合に招待コード要求エラーをスローすること', async () => {
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockConfigService.isAdminEmail.mockReturnValue(false);
			const lineUser = { lineId: 'U9999', name: 'New LINE User' };

			await expect(service.lineLogin(lineUser)).rejects.toBeInstanceOf(AppException);
		});
	});

	describe('lineRegisterWithInvitation', () => {
		it('招待コードが有効な場合に lineId でユーザーを作成すること', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ id: 'invite-1', code: 'CODE' });
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, lineId: 'U1234' });
			mockConfigService.isAdminEmail.mockReturnValue(false);

			const lineUser = { lineId: 'U1234', name: 'LINE User', email: 'line@example.com' };
			const result = await service.lineRegisterWithInvitation(lineUser, 'CODE');

			expect(mockPrismaService.user.create).toHaveBeenCalled();
			expect(mockInvitationService.useInvitation).toHaveBeenCalledWith('CODE');
			expect(result.accessToken).toBeDefined();
		});

		it('無効な招待コードの場合に AppException をスローすること', async () => {
			mockInvitationService.verifyInvitation.mockRejectedValue(new AppException('INV001', 400));
			const lineUser = { lineId: 'U1234', name: 'LINE User', email: 'line@example.com' };

			await expect(service.lineRegisterWithInvitation(lineUser, 'INVALID')).rejects.toBeInstanceOf(
				AppException,
			);
		});
	});

	describe('appleLogin', () => {
		it('appleId フィールドを使ってユーザーを検索すること', async () => {
			const appleUser = { appleId: 'apple-sub-id', name: 'Apple User', email: 'apple@example.com' };
			mockPrismaService.user.findFirst.mockResolvedValue({ ...mockUser, appleId: 'apple-sub-id' });
			mockPrismaService.user.update.mockResolvedValue({ ...mockUser, appleId: 'apple-sub-id' });

			const result = await service.appleLogin(appleUser);

			expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						OR: expect.arrayContaining([{ appleId: 'apple-sub-id' }]) as unknown,
					}) as unknown,
				}),
			);
			expect(result.accessToken).toBeDefined();
		});

		it('新規ユーザーの場合に招待コード要求エラーをスローすること', async () => {
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockConfigService.isAdminEmail.mockReturnValue(false);
			const appleUser = { appleId: 'apple-new-id', name: 'New Apple User', email: undefined };

			await expect(service.appleLogin(appleUser)).rejects.toBeInstanceOf(AppException);
		});
	});

	describe('appleRegisterWithInvitation', () => {
		it('email なし・fallbackEmail ありで登録できること', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ id: 'invite-1', code: 'CODE' });
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, appleId: 'apple-sub-id' });
			mockConfigService.isAdminEmail.mockReturnValue(false);

			const appleUser = { appleId: 'apple-sub-id', name: 'Apple User', email: undefined };
			const result = await service.appleRegisterWithInvitation(
				appleUser,
				'CODE',
				'fallback@example.com',
			);

			expect(mockPrismaService.user.create).toHaveBeenCalled();
			expect(result.accessToken).toBeDefined();
		});

		it('email も fallbackEmail もない場合にエラーをスローすること', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ id: 'invite-1', code: 'CODE' });
			const appleUser = { appleId: 'apple-sub-id', name: 'Apple User', email: undefined };

			await expect(
				service.appleRegisterWithInvitation(appleUser, 'CODE', undefined),
			).rejects.toBeInstanceOf(AppException);
		});
	});

	describe('xLogin', () => {
		it('xId フィールドを使ってユーザーを検索すること', async () => {
			const xUser = { xId: '1234567890', name: 'X User' };
			mockPrismaService.user.findFirst.mockResolvedValue({ ...mockUser, xId: '1234567890' });
			mockPrismaService.user.update.mockResolvedValue({ ...mockUser, xId: '1234567890' });

			const result = await service.xLogin(xUser);

			expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						OR: expect.arrayContaining([{ xId: '1234567890' }]) as unknown,
					}) as unknown,
				}),
			);
			expect(result.accessToken).toBeDefined();
		});

		it('新規ユーザーの場合に招待コード要求エラーをスローすること', async () => {
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockConfigService.isAdminEmail.mockReturnValue(false);
			const xUser = { xId: 'x-new-id', name: 'New X User' };

			await expect(service.xLogin(xUser)).rejects.toBeInstanceOf(AppException);
		});
	});

	describe('xRegisterWithInvitation', () => {
		it('招待コードが有効な場合に xId でユーザーを作成すること', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ id: 'invite-1', code: 'CODE' });
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, xId: '1234' });
			mockConfigService.isAdminEmail.mockReturnValue(false);

			const xUser = { xId: '1234', name: 'X User', email: 'x@example.com' };
			const result = await service.xRegisterWithInvitation(xUser, 'CODE');

			expect(mockPrismaService.user.create).toHaveBeenCalled();
			expect(mockInvitationService.useInvitation).toHaveBeenCalledWith('CODE');
			expect(result.accessToken).toBeDefined();
		});

		it('無効な招待コードの場合に AppException をスローすること', async () => {
			mockInvitationService.verifyInvitation.mockRejectedValue(new AppException('INV001', 400));
			const xUser = { xId: '1234', name: 'X User', email: 'x@example.com' };

			await expect(service.xRegisterWithInvitation(xUser, 'INVALID')).rejects.toBeInstanceOf(
				AppException,
			);
		});
	});
});

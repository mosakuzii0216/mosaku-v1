import { Test, TestingModule } from '@nestjs/testing';
import { OAuthService } from './oauth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { InvitationService } from '../invitation/invitation.service';
import { JwtTokenService } from './jwt.service';
import { RefreshTokenService } from './refresh-token.service';
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

	const mockRefreshTokenService = {
		issue: jest.fn().mockResolvedValue({
			plainRt: 'oauth-plain-rt',
			expiresAt: new Date(Date.now() + 30 * 86_400_000),
			familyId: 'oauth-fam-1',
		}),
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				OAuthService,
				{ provide: PrismaService, useValue: mockPrismaService },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: InvitationService, useValue: mockInvitationService },
				{ provide: JwtTokenService, useValue: mockJwtTokenService },
				{ provide: RefreshTokenService, useValue: mockRefreshTokenService },
			],
		}).compile();

		service = module.get<OAuthService>(OAuthService);
		jest.clearAllMocks();
		mockRefreshTokenService.issue.mockResolvedValue({
			plainRt: 'oauth-plain-rt',
			expiresAt: new Date(Date.now() + 30 * 86_400_000),
			familyId: 'oauth-fam-1',
		});
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

		it('admin 以外の新規 OAuth ログインは ADMIN_EMAIL_REQUIRED (AUTHZ005) で弾かれること', async () => {
			// Task 9.1: 旧 INVITATION_REQUIRED (AUTH005) 経路を撤去。新フローでは admin email 例外のみ。
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockConfigService.isAdminEmail.mockReturnValue(false);

			await expect(service.handleOAuthLogin(oauthUser, 'provider-id-123')).rejects.toMatchObject({
				code: 'AUTHZ005',
			});
		});
	});

	describe('旧 register-with-invitation メソッドが削除されていること', () => {
		it.each([
			'handleOAuthRegistrationWithInvitation',
			'googleRegisterWithInvitation',
			'githubRegisterWithInvitation',
			'lineRegisterWithInvitation',
			'appleRegisterWithInvitation',
			'xRegisterWithInvitation',
		])('OAuthService.%s は削除されている', (method) => {
			expect((service as unknown as Record<string, unknown>)[method]).toBeUndefined();
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

		it('新規ユーザーの場合に ADMIN_EMAIL_REQUIRED で弾かれること', async () => {
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockConfigService.isAdminEmail.mockReturnValue(false);
			const lineUser = { lineId: 'U9999', name: 'New LINE User' };

			await expect(service.lineLogin(lineUser)).rejects.toMatchObject({ code: 'AUTHZ005' });
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

		it('新規ユーザーの場合に ADMIN_EMAIL_REQUIRED で弾かれること', async () => {
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockConfigService.isAdminEmail.mockReturnValue(false);
			const appleUser = { appleId: 'apple-new-id', name: 'New Apple User', email: undefined };

			await expect(service.appleLogin(appleUser)).rejects.toMatchObject({ code: 'AUTHZ005' });
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

		it('新規ユーザーの場合に ADMIN_EMAIL_REQUIRED で弾かれること', async () => {
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockConfigService.isAdminEmail.mockReturnValue(false);
			const xUser = { xId: 'x-new-id', name: 'New X User' };

			await expect(service.xLogin(xUser)).rejects.toMatchObject({ code: 'AUTHZ005' });
		});
	});

	// ─── Task 5.2: state 由来登録（OAuth 順序逆転新フロー）─────────────────────

	describe('googleRegisterWithStateInvitation', () => {
		it('招待コードを再検証し、新規ユーザー作成 + useInvitation + access/refresh 発行までを完了すること', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ id: 'invite-1', code: 'CODE' });
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({
				...mockUser,
				email: 'new-google@example.com',
				oauthId: 'google-id-state',
			});
			mockConfigService.isAdminEmail.mockReturnValue(false);

			const result = await service.googleRegisterWithStateInvitation({
				oauthUser: {
					googleId: 'google-id-state',
					email: 'new-google@example.com',
					name: 'New Google',
				},
				invitationCode: 'CODE',
				ctx: { ip: '10.0.0.1', userAgent: 'jest' },
			});

			expect(mockInvitationService.verifyInvitation).toHaveBeenCalledWith('CODE');
			expect(mockInvitationService.useInvitation).toHaveBeenCalledWith('CODE');
			expect(mockPrismaService.user.create).toHaveBeenCalled();
			expect(result.accessToken).toBeDefined();
			expect(result.refresh).toBeDefined();
		});

		it('admin email 該当者は role=ADMIN で作成されること', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ id: 'invite-1', code: 'CODE' });
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, role: 'ADMIN' });
			mockConfigService.isAdminEmail.mockReturnValue(true);

			await service.googleRegisterWithStateInvitation({
				oauthUser: {
					googleId: 'google-admin',
					email: 'admin@example.com',
					name: 'Admin',
				},
				invitationCode: 'CODE',
				ctx: { ip: null, userAgent: null },
			});

			expect(mockPrismaService.user.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ role: 'ADMIN' }) as unknown,
				}),
			);
		});
	});

	describe('githubRegisterWithStateInvitation', () => {
		it('GitHub OAuth 経由の state 由来登録が成功すること', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ id: 'invite-1', code: 'CODE' });
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, oauthId: 'gh-state' });
			mockConfigService.isAdminEmail.mockReturnValue(false);

			const result = await service.githubRegisterWithStateInvitation({
				oauthUser: {
					githubId: 'gh-state',
					email: 'gh@example.com',
					name: 'GH',
				},
				invitationCode: 'CODE',
				ctx: { ip: null, userAgent: null },
			});

			expect(mockInvitationService.useInvitation).toHaveBeenCalledWith('CODE');
			expect(result.accessToken).toBeDefined();
		});
	});

	describe('lineRegisterWithStateInvitation', () => {
		it('LINE OAuth 経由の state 由来登録が成功すること', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ id: 'invite-1', code: 'CODE' });
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, lineId: 'U999' });
			mockConfigService.isAdminEmail.mockReturnValue(false);

			const result = await service.lineRegisterWithStateInvitation({
				oauthUser: { lineId: 'U999', email: 'line@example.com', name: 'LINE' },
				invitationCode: 'CODE',
				ctx: { ip: null, userAgent: null },
			});

			expect(mockInvitationService.useInvitation).toHaveBeenCalledWith('CODE');
			expect(result.accessToken).toBeDefined();
		});
	});

	describe('appleRegisterWithStateInvitation', () => {
		it('email 不在でも fallbackEmail で登録が成功すること', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ id: 'invite-1', code: 'CODE' });
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, appleId: 'sub-state' });
			mockConfigService.isAdminEmail.mockReturnValue(false);

			const result = await service.appleRegisterWithStateInvitation({
				oauthUser: { appleId: 'sub-state', name: 'Apple' },
				invitationCode: 'CODE',
				ctx: { ip: null, userAgent: null },
				fallbackEmail: 'apple-fallback@example.com',
			});

			expect(mockInvitationService.useInvitation).toHaveBeenCalledWith('CODE');
			expect(result.accessToken).toBeDefined();
		});

		it('email も fallbackEmail もない場合に AppException', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ id: 'invite-1', code: 'CODE' });

			await expect(
				service.appleRegisterWithStateInvitation({
					oauthUser: { appleId: 'sub-state', name: 'Apple' },
					invitationCode: 'CODE',
					ctx: { ip: null, userAgent: null },
				}),
			).rejects.toBeInstanceOf(AppException);
		});
	});

	describe('xRegisterWithStateInvitation', () => {
		it('X OAuth 経由の state 由来登録が成功すること', async () => {
			mockInvitationService.verifyInvitation.mockResolvedValue({ id: 'invite-1', code: 'CODE' });
			mockPrismaService.user.findFirst.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, xId: 'x-state' });
			mockConfigService.isAdminEmail.mockReturnValue(false);

			const result = await service.xRegisterWithStateInvitation({
				oauthUser: { xId: 'x-state', name: 'X', email: 'x-state@example.com' },
				invitationCode: 'CODE',
				ctx: { ip: null, userAgent: null },
			});

			expect(mockInvitationService.useInvitation).toHaveBeenCalledWith('CODE');
			expect(result.accessToken).toBeDefined();
		});
	});
});

import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { JwtTokenService } from './jwt.service';
import { InvitationService } from '../invitation/invitation.service';
import { RefreshTokenService } from './refresh-token.service';
import { AppException } from '../common/exceptions';

describe('AuthService', () => {
	let service: AuthService;

	const mockUser = {
		id: 'user-id-1',
		email: 'test@example.com',
		password: 'hashed-password',
		name: 'Test User',
		role: 'USER' as const,
		createdAt: new Date(),
		updatedAt: new Date(),
		oauthId: null,
		emailVerified: false,
		picture: null,
	};

	const mockPrismaService = {
		user: {
			findUnique: jest.fn(),
			create: jest.fn(),
		},
	};

	const mockConfigService = {
		isAdminEmail: jest.fn().mockReturnValue(false),
	};

	const mockJwtTokenService = {
		generateTokens: jest.fn().mockReturnValue({ accessToken: 'mock-token' }),
	};

	const mockInvitationService = {
		verifyInvitation: jest.fn(),
		useInvitation: jest.fn(),
	};

	const mockRefreshTokenService = {
		issue: jest.fn().mockResolvedValue({
			plainRt: 'plain-rt',
			expiresAt: new Date(Date.now() + 30 * 86_400_000),
			familyId: 'fam-1',
		}),
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuthService,
				{ provide: PrismaService, useValue: mockPrismaService },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: JwtTokenService, useValue: mockJwtTokenService },
				{ provide: InvitationService, useValue: mockInvitationService },
				{ provide: RefreshTokenService, useValue: mockRefreshTokenService },
			],
		}).compile();

		service = module.get<AuthService>(AuthService);
		jest.clearAllMocks();
		mockRefreshTokenService.issue.mockResolvedValue({
			plainRt: 'plain-rt',
			expiresAt: new Date(Date.now() + 30 * 86_400_000),
			familyId: 'fam-1',
		});
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	it('should have InvitationService injected', () => {
		expect(service['invitationService']).toBeDefined();
	});

	describe('hashPassword', () => {
		it('should return a bcrypt hash different from the plain password', async () => {
			const password = 'plain-password';
			const hash = await service.hashPassword(password);

			expect(hash).not.toBe(password);
			expect(await bcrypt.compare(password, hash)).toBe(true);
		});
	});

	describe('comparePassword', () => {
		it('should return true for a matching password', async () => {
			const password = 'plain-password';
			const hash = await bcrypt.hash(password, 10);

			expect(await service.comparePassword(password, hash)).toBe(true);
		});

		it('should return false for a non-matching password', async () => {
			const hash = await bcrypt.hash('correct-password', 10);

			expect(await service.comparePassword('wrong-password', hash)).toBe(false);
		});
	});

	describe('validateUser', () => {
		it('should return user without password when credentials are valid', async () => {
			const password = 'correct-password';
			const hash = await bcrypt.hash(password, 10);
			mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, password: hash });

			const result = await service.validateUser(mockUser.email, password);

			expect(result).not.toHaveProperty('password');
			expect(result.email).toBe(mockUser.email);
		});

		it('should throw when user is not found', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);

			await expect(service.validateUser('notfound@example.com', 'password')).rejects.toBeInstanceOf(
				AppException,
			);
		});

		it('should throw when password does not match', async () => {
			const hash = await bcrypt.hash('correct-password', 10);
			mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, password: hash });

			await expect(service.validateUser(mockUser.email, 'wrong-password')).rejects.toBeInstanceOf(
				AppException,
			);
		});

		it('should throw when user has no password (OAuth-only user)', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, password: null });

			await expect(service.validateUser(mockUser.email, 'any-password')).rejects.toBeInstanceOf(
				AppException,
			);
		});
	});

	describe('validateJwtPayload', () => {
		it('should return user without password when payload is valid', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

			const result = await service.validateJwtPayload({ sub: mockUser.id });

			expect(result).not.toHaveProperty('password');
			expect(result.id).toBe(mockUser.id);
		});

		it('should throw when user is not found', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);

			await expect(service.validateJwtPayload({ sub: 'unknown-id' })).rejects.toBeInstanceOf(
				AppException,
			);
		});
	});

	describe('register', () => {
		it('should create a new USER user', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, role: 'USER' });
			mockConfigService.isAdminEmail.mockReturnValue(false);

			const result = await service.register('new@example.com', 'password123', 'New User');

			expect(mockPrismaService.user.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ role: 'USER' }) as unknown,
				}),
			);
			expect(result).not.toHaveProperty('password');
		});

		it('should create a new ADMIN user when email matches admin email', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, role: 'ADMIN' });
			mockConfigService.isAdminEmail.mockReturnValue(true);

			await service.register('admin@example.com', 'password123', 'Admin');

			expect(mockPrismaService.user.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ role: 'ADMIN' }) as unknown,
				}),
			);
		});

		it('should throw when email already exists', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

			await expect(service.register(mockUser.email, 'password', 'Name')).rejects.toBeInstanceOf(
				AppException,
			);
		});

		it('should use email as name when name is not provided', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, name: mockUser.email });

			await service.register(mockUser.email, 'password');

			expect(mockPrismaService.user.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ name: mockUser.email }) as unknown,
				}),
			);
		});

		it('should call verifyInvitation and useInvitation when a valid invitation code is provided', async () => {
			const invitationCode = 'VALID-CODE';
			const mockInvitation = { id: 'inv-1', code: invitationCode };

			mockPrismaService.user.findUnique.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, role: 'USER' });
			mockConfigService.isAdminEmail.mockReturnValue(false);
			mockInvitationService.verifyInvitation.mockResolvedValue(mockInvitation);
			mockInvitationService.useInvitation.mockResolvedValue(mockInvitation);

			await service.register('new@example.com', 'password123', 'New User', invitationCode);

			expect(mockInvitationService.verifyInvitation).toHaveBeenCalledWith(invitationCode);
			expect(mockInvitationService.useInvitation).toHaveBeenCalledWith(invitationCode);
		});

		it('should not create user and not call useInvitation when verifyInvitation throws', async () => {
			const invitationCode = 'INVALID-CODE';

			mockPrismaService.user.findUnique.mockResolvedValue(null);
			mockConfigService.isAdminEmail.mockReturnValue(false);
			mockInvitationService.verifyInvitation.mockRejectedValue(
				new AppException('INV001', 400, 'Invalid code'),
			);

			await expect(
				service.register('new@example.com', 'password123', 'New User', invitationCode),
			).rejects.toBeInstanceOf(AppException);

			expect(mockPrismaService.user.create).not.toHaveBeenCalled();
			expect(mockInvitationService.useInvitation).not.toHaveBeenCalled();
		});

		it('should not call verifyInvitation or useInvitation for admin email', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, role: 'ADMIN' });
			mockConfigService.isAdminEmail.mockReturnValue(true);

			await service.register('admin@example.com', 'password123', 'Admin');

			expect(mockInvitationService.verifyInvitation).not.toHaveBeenCalled();
			expect(mockInvitationService.useInvitation).not.toHaveBeenCalled();
		});

		it('should not call useInvitation when user creation fails', async () => {
			const invitationCode = 'VALID-CODE';

			mockPrismaService.user.findUnique.mockResolvedValue(null);
			mockConfigService.isAdminEmail.mockReturnValue(false);
			mockInvitationService.verifyInvitation.mockResolvedValue({
				id: 'inv-1',
				code: invitationCode,
			});
			mockPrismaService.user.create.mockRejectedValue(new Error('DB error'));

			await expect(
				service.register('new@example.com', 'password123', 'New User', invitationCode),
			).rejects.toThrow();

			expect(mockInvitationService.useInvitation).not.toHaveBeenCalled();
		});
	});

	describe('login', () => {
		it('should return accessToken, user without password, and refresh metadata', async () => {
			const password = 'correct-password';
			const hash = await bcrypt.hash(password, 10);
			mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, password: hash });
			mockJwtTokenService.generateTokens.mockReturnValue({ accessToken: 'test-token' });

			const result = await service.login(mockUser.email, password, {
				ip: '10.0.0.1',
				userAgent: 'jest',
			});

			expect(result.accessToken).toBe('test-token');
			expect(result.user).not.toHaveProperty('password');
			expect(result.refresh.plainRt).toEqual(expect.any(String));
			expect(result.refresh.familyId).toEqual(expect.any(String));
			expect(mockRefreshTokenService.issue).toHaveBeenCalledWith({
				userId: mockUser.id,
				ip: '10.0.0.1',
				userAgent: 'jest',
			});
		});

		it('should propagate exception and not return AT when RT issuance fails', async () => {
			const password = 'correct-password';
			const hash = await bcrypt.hash(password, 10);
			mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, password: hash });
			mockJwtTokenService.generateTokens.mockReturnValue({ accessToken: 'test-token' });
			mockRefreshTokenService.issue.mockRejectedValue(new Error('DB write failed'));

			await expect(
				service.login(mockUser.email, password, { ip: null, userAgent: null }),
			).rejects.toThrow('DB write failed');
		});
	});

	describe('findUserById', () => {
		it('should return user without password', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

			const result = await service.findUserById(mockUser.id);

			expect(result).not.toHaveProperty('password');
			expect(result.id).toBe(mockUser.id);
		});

		it('should throw when user is not found', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);

			await expect(service.findUserById('unknown-id')).rejects.toBeInstanceOf(AppException);
		});
	});

	describe('COMP perk 前方互換縮退（Task 4.2）', () => {
		it('COMP 特典付きコードでも email 登録が成立すること（perk 非参照）', async () => {
			const invitationCode = 'COMP-CODE-123';
			mockPrismaService.user.findUnique.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, role: 'USER' });
			mockConfigService.isAdminEmail.mockReturnValue(false);
			mockInvitationService.verifyInvitation.mockResolvedValue({
				code: invitationCode,
				status: 'valid',
				creator: { id: 'creator-id', name: 'Creator', maskedId: 'crea***' },
				expiresAt: null,
				usesRemaining: 5,
				perk: { type: 'comp', months: 3 },
			});
			mockInvitationService.useInvitation.mockResolvedValue(undefined);

			const result = await service.register(
				'new@example.com',
				'password123',
				'New User',
				invitationCode,
			);

			expect(result).not.toHaveProperty('password');
			expect(mockInvitationService.verifyInvitation).toHaveBeenCalledWith(invitationCode);
			expect(mockInvitationService.useInvitation).toHaveBeenCalledWith(invitationCode);
			// 課金カラムへの書き込みが発生しないこと（カラム未実装）
			expect(mockPrismaService.user.create).toHaveBeenCalledWith(
				expect.objectContaining({
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					data: expect.not.objectContaining({ subscriptionStatus: expect.anything() }),
				}),
			);
		});

		it('AuthService が PerkGate を注入していないこと（applyPerk は後続 spec の責務）', () => {
			// 登録フローは perk 非参照のまま。applyPerk 配線は後続 spec で行う
			expect((service as unknown as Record<string, unknown>)['perkGate']).toBeUndefined();
		});
	});
});

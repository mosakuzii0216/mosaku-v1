import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { JwtTokenService } from './jwt.service';
import { AppException } from '../common/exceptions';

describe('AuthService', () => {
	let service: AuthService;

	const mockUser = {
		id: 'user-id-1',
		email: 'test@example.com',
		password: 'hashed-password',
		name: 'Test User',
		role: 'FREE' as const,
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

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuthService,
				{ provide: PrismaService, useValue: mockPrismaService },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: JwtTokenService, useValue: mockJwtTokenService },
			],
		}).compile();

		service = module.get<AuthService>(AuthService);
		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
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
		it('should create a new FREE user', async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue({ ...mockUser, role: 'FREE' });
			mockConfigService.isAdminEmail.mockReturnValue(false);

			const result = await service.register('new@example.com', 'password123', 'New User');

			expect(mockPrismaService.user.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ role: 'FREE' }),
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
					data: expect.objectContaining({ role: 'ADMIN' }),
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
					data: expect.objectContaining({ name: mockUser.email }),
				}),
			);
		});
	});

	describe('login', () => {
		it('should return accessToken and user without password', async () => {
			const password = 'correct-password';
			const hash = await bcrypt.hash(password, 10);
			mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, password: hash });
			mockJwtTokenService.generateTokens.mockReturnValue({ accessToken: 'test-token' });

			const result = await service.login(mockUser.email, password);

			expect(result.accessToken).toBe('test-token');
			expect(result.user).not.toHaveProperty('password');
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
});

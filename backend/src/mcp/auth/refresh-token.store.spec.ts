import { Test, TestingModule } from '@nestjs/testing';
import { McpRefreshTokenStore } from './refresh-token.store';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
	mcpRefreshToken: {
		create: jest.fn(),
		findUnique: jest.fn(),
		update: jest.fn(),
	},
	$transaction: jest.fn(),
};

describe('McpRefreshTokenStore', () => {
	let store: McpRefreshTokenStore;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [McpRefreshTokenStore, { provide: PrismaService, useValue: mockPrisma }],
		}).compile();

		store = module.get<McpRefreshTokenStore>(McpRefreshTokenStore);
		jest.clearAllMocks();
	});

	describe('create', () => {
		it('should create and return a refresh token', async () => {
			const input = {
				tokenHash: 'hashed-token-abc',
				clientId: 'client-id-123',
				userId: 'user-id-456',
				scope: 'memo:read memo:write',
				expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
			};
			const created = {
				id: 'rt-id-1',
				...input,
				rotatedAt: null,
				revokedAt: null,
				createdAt: new Date(),
			};
			mockPrisma.mcpRefreshToken.create.mockResolvedValue(created);

			const result = await store.create(input);

			expect(result.id).toBe('rt-id-1');
			expect(result.tokenHash).toBe('hashed-token-abc');
			expect(result.revokedAt).toBeNull();
			expect(mockPrisma.mcpRefreshToken.create).toHaveBeenCalledWith({
				data: expect.objectContaining({ tokenHash: 'hashed-token-abc', userId: 'user-id-456' }),
			});
		});
	});

	describe('findByHash', () => {
		it('should return token when found', async () => {
			const token = {
				id: 'rt-id-1',
				tokenHash: 'hashed-token',
				clientId: 'client-id',
				userId: 'user-id',
				scope: 'memo:read',
				expiresAt: new Date(Date.now() + 3600_000),
				rotatedAt: null,
				revokedAt: null,
				createdAt: new Date(),
			};
			mockPrisma.mcpRefreshToken.findUnique.mockResolvedValue(token);

			const result = await store.findByHash('hashed-token');

			expect(result).not.toBeNull();
			expect(result!.tokenHash).toBe('hashed-token');
		});

		it('should return null when not found', async () => {
			mockPrisma.mcpRefreshToken.findUnique.mockResolvedValue(null);

			const result = await store.findByHash('nonexistent');

			expect(result).toBeNull();
		});
	});

	describe('rotate', () => {
		it('should revoke old token and create new one atomically', async () => {
			const oldToken = {
				id: 'rt-old',
				tokenHash: 'old-hash',
				clientId: 'client-id',
				userId: 'user-id',
				scope: 'memo:read memo:write',
				expiresAt: new Date(Date.now() + 3600_000),
				rotatedAt: null,
				revokedAt: null,
				createdAt: new Date(),
			};
			const newToken = {
				id: 'rt-new',
				tokenHash: 'new-hash',
				clientId: 'client-id',
				userId: 'user-id',
				scope: 'memo:read memo:write',
				expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
				rotatedAt: null,
				revokedAt: null,
				createdAt: new Date(),
			};
			const updateMock = jest.fn().mockResolvedValue({ ...oldToken, rotatedAt: new Date() });
			const createMock = jest.fn().mockResolvedValue(newToken);

			mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txMock = {
					mcpRefreshToken: {
						update: updateMock,
						create: createMock,
					},
				};
				return fn(txMock);
			});

			const result = await store.rotate(
				oldToken,
				'new-hash',
				new Date(Date.now() + 7 * 24 * 3600_000),
			);

			expect(result.tokenHash).toBe('new-hash');
			expect(updateMock).toHaveBeenCalledWith({
				where: { id: 'rt-old' },
				data: { rotatedAt: expect.any(Date) },
			});
			expect(createMock).toHaveBeenCalledWith({
				data: expect.objectContaining({ tokenHash: 'new-hash', userId: 'user-id' }),
			});
		});
	});

	describe('revoke', () => {
		it('should set revokedAt on the token', async () => {
			const revokedToken = {
				id: 'rt-id-1',
				tokenHash: 'hash',
				clientId: 'client-id',
				userId: 'user-id',
				scope: 'memo:read',
				expiresAt: new Date(),
				rotatedAt: null,
				revokedAt: new Date(),
				createdAt: new Date(),
			};
			mockPrisma.mcpRefreshToken.update.mockResolvedValue(revokedToken);

			await store.revoke('rt-id-1');

			expect(mockPrisma.mcpRefreshToken.update).toHaveBeenCalledWith({
				where: { id: 'rt-id-1' },
				data: { revokedAt: expect.any(Date) },
			});
		});
	});
});

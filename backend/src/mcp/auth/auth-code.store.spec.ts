import { Test, TestingModule } from '@nestjs/testing';
import { AuthCodeStore } from './auth-code.store';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
	mcpAuthCode: {
		create: jest.fn(),
		findUnique: jest.fn(),
		delete: jest.fn(),
	},
	$transaction: jest.fn(),
};

describe('AuthCodeStore', () => {
	let store: AuthCodeStore;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [AuthCodeStore, { provide: PrismaService, useValue: mockPrisma }],
		}).compile();

		store = module.get<AuthCodeStore>(AuthCodeStore);
		jest.clearAllMocks();
	});

	describe('create', () => {
		it('should create and return an auth code', async () => {
			const input = {
				code: 'auth-code-abc',
				clientId: 'client-id-123',
				userId: 'user-id-456',
				redirectUri: 'https://example.com/callback',
				codeChallenge: 'challenge-hash',
				scope: 'memo:read memo:write',
				resource: 'https://api.mosaku.jp/mcp',
				expiresAt: new Date(Date.now() + 60_000),
			};
			const created = { ...input, codeChallengeMethod: 'S256', createdAt: new Date() };
			mockPrisma.mcpAuthCode.create.mockResolvedValue(created);

			const result = await store.create(input);

			expect(result.code).toBe('auth-code-abc');
			expect(result.codeChallengeMethod).toBe('S256');
			expect(mockPrisma.mcpAuthCode.create).toHaveBeenCalledWith({
				data: expect.objectContaining({ code: 'auth-code-abc', clientId: 'client-id-123' }),
			});
		});
	});

	describe('findAndConsume', () => {
		it('should return null when code does not exist', async () => {
			mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txMock = {
					mcpAuthCode: {
						findUnique: jest.fn().mockResolvedValue(null),
						delete: jest.fn(),
					},
				};
				return fn(txMock);
			});

			const result = await store.findAndConsume('nonexistent-code');

			expect(result).toBeNull();
		});

		it('should return null when code is expired', async () => {
			const expiredCode = {
				code: 'expired-code',
				clientId: 'client-id',
				userId: 'user-id',
				redirectUri: 'https://example.com/cb',
				codeChallenge: 'ch',
				codeChallengeMethod: 'S256',
				scope: 'memo:read',
				resource: 'https://api.mosaku.jp/mcp',
				expiresAt: new Date(Date.now() - 1000),
				createdAt: new Date(),
			};
			mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txMock = {
					mcpAuthCode: {
						findUnique: jest.fn().mockResolvedValue(expiredCode),
						delete: jest.fn(),
					},
				};
				return fn(txMock);
			});

			const result = await store.findAndConsume('expired-code');

			expect(result).toBeNull();
		});

		it('should delete and return code atomically when valid', async () => {
			const validCode = {
				code: 'valid-code',
				clientId: 'client-id',
				userId: 'user-id',
				redirectUri: 'https://example.com/cb',
				codeChallenge: 'ch',
				codeChallengeMethod: 'S256',
				scope: 'memo:read memo:write',
				resource: 'https://api.mosaku.jp/mcp',
				expiresAt: new Date(Date.now() + 60_000),
				createdAt: new Date(),
			};
			const deleteMock = jest.fn().mockResolvedValue(validCode);
			mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txMock = {
					mcpAuthCode: {
						findUnique: jest.fn().mockResolvedValue(validCode),
						delete: deleteMock,
					},
				};
				return fn(txMock);
			});

			const result = await store.findAndConsume('valid-code');

			expect(result).not.toBeNull();
			expect(result!.code).toBe('valid-code');
			expect(deleteMock).toHaveBeenCalledWith({ where: { code: 'valid-code' } });
		});

		it('should prevent double consumption by deleting inside transaction', async () => {
			const validCode = {
				code: 'one-time-code',
				clientId: 'c',
				userId: 'u',
				redirectUri: 'https://x.com/cb',
				codeChallenge: 'ch',
				codeChallengeMethod: 'S256',
				scope: 'memo:read',
				resource: 'https://api.mosaku.jp/mcp',
				expiresAt: new Date(Date.now() + 60_000),
				createdAt: new Date(),
			};
			const deleteMock = jest.fn().mockResolvedValue(validCode);
			let callCount = 0;
			mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				callCount++;
				const txMock = {
					mcpAuthCode: {
						findUnique: jest.fn().mockResolvedValue(callCount === 1 ? validCode : null),
						delete: deleteMock,
					},
				};
				return fn(txMock);
			});

			const first = await store.findAndConsume('one-time-code');
			const second = await store.findAndConsume('one-time-code');

			expect(first).not.toBeNull();
			expect(second).toBeNull();
		});
	});
});

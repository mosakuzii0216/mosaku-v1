import { Test, TestingModule } from '@nestjs/testing';
import { OAuthClientStore } from './oauth-client.store';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
	mcpOAuthClient: {
		create: jest.fn(),
		findUnique: jest.fn(),
	},
};

describe('OAuthClientStore', () => {
	let store: OAuthClientStore;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [OAuthClientStore, { provide: PrismaService, useValue: mockPrisma }],
		}).compile();

		store = module.get<OAuthClientStore>(OAuthClientStore);
		jest.clearAllMocks();
	});

	describe('create', () => {
		it('should create and return an OAuth client', async () => {
			const input = {
				clientName: 'Test Client',
				redirectUris: ['https://example.com/callback'],
				grantTypes: ['authorization_code', 'refresh_token'],
			};
			const created = {
				id: 'client-id-123',
				clientName: input.clientName,
				redirectUris: input.redirectUris,
				grantTypes: input.grantTypes,
				tokenEndpointAuthMethod: 'none',
				clientSecretHash: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			mockPrisma.mcpOAuthClient.create.mockResolvedValue(created);

			const result = await store.create(input);

			expect(result.id).toBe('client-id-123');
			expect(result.clientName).toBe('Test Client');
			expect(result.tokenEndpointAuthMethod).toBe('none');
			expect(mockPrisma.mcpOAuthClient.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					clientName: 'Test Client',
					redirectUris: input.redirectUris,
					grantTypes: input.grantTypes,
				}),
			});
		});
	});

	describe('findById', () => {
		it('should return client when found', async () => {
			const client = {
				id: 'client-id-123',
				clientName: 'Test Client',
				redirectUris: ['https://example.com/callback'],
				grantTypes: ['authorization_code'],
				tokenEndpointAuthMethod: 'none',
				clientSecretHash: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			mockPrisma.mcpOAuthClient.findUnique.mockResolvedValue(client);

			const result = await store.findById('client-id-123');

			expect(result).not.toBeNull();
			expect(result!.id).toBe('client-id-123');
			expect(mockPrisma.mcpOAuthClient.findUnique).toHaveBeenCalledWith({
				where: { id: 'client-id-123' },
			});
		});

		it('should return null when not found', async () => {
			mockPrisma.mcpOAuthClient.findUnique.mockResolvedValue(null);

			const result = await store.findById('nonexistent-id');

			expect(result).toBeNull();
		});
	});
});

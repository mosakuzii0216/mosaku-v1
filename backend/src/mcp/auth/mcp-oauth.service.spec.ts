import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { McpOAuthService } from './mcp-oauth.service';
import { OAuthClientStore } from './oauth-client.store';
import { AuthCodeStore } from './auth-code.store';
import { McpRefreshTokenStore } from './refresh-token.store';
import { ConfigService } from '../../config/config.service';

const BACKEND_URL = 'https://api.example.com';
const MCP_URL = `${BACKEND_URL}/mcp`;

const mockClientStore = {
	create: jest.fn(),
	findById: jest.fn(),
};

const mockCodeStore = {
	create: jest.fn(),
	findAndConsume: jest.fn(),
};

const mockRefreshStore = {
	create: jest.fn(),
	findByHash: jest.fn(),
	rotate: jest.fn(),
	revoke: jest.fn(),
};

const mockJwtService = {
	sign: jest.fn().mockReturnValue('mocked-access-token'),
};

const mockConfig = {
	backendUrl: BACKEND_URL,
	mcpCanonicalUrl: MCP_URL,
};

function makeChallenge(verifier: string): string {
	return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

describe('McpOAuthService', () => {
	let service: McpOAuthService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				McpOAuthService,
				{ provide: OAuthClientStore, useValue: mockClientStore },
				{ provide: AuthCodeStore, useValue: mockCodeStore },
				{ provide: McpRefreshTokenStore, useValue: mockRefreshStore },
				{ provide: JwtService, useValue: mockJwtService },
				{ provide: ConfigService, useValue: mockConfig },
			],
		}).compile();

		service = module.get<McpOAuthService>(McpOAuthService);
		jest.clearAllMocks();
		mockJwtService.sign.mockReturnValue('mocked-access-token');
	});

	// =================== 4.2 DCR ===================

	describe('registerClient', () => {
		it('should create client with valid https redirect_uri', async () => {
			mockClientStore.create.mockResolvedValue({
				id: 'client-1',
				clientName: 'Test',
				redirectUris: ['https://example.com/cb'],
				grantTypes: ['authorization_code'],
				tokenEndpointAuthMethod: 'none',
				clientSecretHash: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await service.registerClient({
				clientName: 'Test',
				redirectUris: ['https://example.com/cb'],
			});

			expect(mockClientStore.create).toHaveBeenCalledWith(
				expect.objectContaining({ redirectUris: ['https://example.com/cb'] }),
			);
		});

		it('should create client with localhost http redirect_uri', async () => {
			mockClientStore.create.mockResolvedValue({
				id: 'client-2',
				clientName: 'Claude Code',
				redirectUris: ['http://localhost:12345/callback'],
				grantTypes: ['authorization_code'],
				tokenEndpointAuthMethod: 'none',
				clientSecretHash: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await service.registerClient({
				clientName: 'Claude Code',
				redirectUris: ['http://localhost:12345/callback'],
			});

			expect(mockClientStore.create).toHaveBeenCalled();
		});

		it('should create client with 127.0.0.1 loopback redirect_uri', async () => {
			mockClientStore.create.mockResolvedValue({
				id: 'client-3',
				clientName: 'Local',
				redirectUris: ['http://127.0.0.1:8080/cb'],
				grantTypes: ['authorization_code'],
				tokenEndpointAuthMethod: 'none',
				clientSecretHash: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await service.registerClient({
				clientName: 'Local',
				redirectUris: ['http://127.0.0.1:8080/cb'],
			});

			expect(mockClientStore.create).toHaveBeenCalled();
		});

		it('should reject http non-localhost redirect_uri', async () => {
			await expect(
				service.registerClient({
					clientName: 'Bad',
					redirectUris: ['http://evil.com/callback'],
				}),
			).rejects.toThrow(BadRequestException);
		});

		it('should reject empty redirect_uris array', async () => {
			await expect(service.registerClient({ clientName: 'Bad', redirectUris: [] })).rejects.toThrow(
				BadRequestException,
			);
		});

		it('should reject when any redirect_uri is invalid even if others are valid', async () => {
			await expect(
				service.registerClient({
					clientName: 'Bad',
					redirectUris: ['https://ok.com/cb', 'http://evil.com/cb'],
				}),
			).rejects.toThrow(BadRequestException);
		});
	});

	// =================== PKCE ===================

	describe('verifyPkceS256', () => {
		it('should return true when code_verifier matches code_challenge', () => {
			const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
			const challenge = makeChallenge(verifier);
			expect(service.verifyPkceS256(verifier, challenge)).toBe(true);
		});

		it('should return false when code_verifier does not match code_challenge', () => {
			expect(service.verifyPkceS256('wrong-verifier', 'some-challenge')).toBe(false);
		});

		it('should return false for empty strings', () => {
			expect(service.verifyPkceS256('', '')).toBe(false);
		});
	});

	// =================== 4.4 Token: authorization_code grant ===================

	describe('exchangeAuthorizationCode', () => {
		const baseRecord = {
			code: 'auth-code',
			clientId: 'client-1',
			userId: 'user-1',
			redirectUri: 'https://example.com/cb',
			codeChallenge: '', // filled per test
			codeChallengeMethod: 'S256',
			scope: 'memo:read memo:write',
			resource: MCP_URL,
			expiresAt: new Date(Date.now() + 60000),
			createdAt: new Date(),
		};

		it('should exchange valid code with correct PKCE verifier and return tokens', async () => {
			const verifier = randomBytes(32).toString('base64url');
			const challenge = makeChallenge(verifier);
			const record = { ...baseRecord, codeChallenge: challenge };

			mockCodeStore.findAndConsume.mockResolvedValue(record);
			mockRefreshStore.create.mockResolvedValue({
				id: 'rt-1',
				tokenHash: 'hash',
				clientId: 'client-1',
				userId: 'user-1',
				scope: record.scope,
				expiresAt: new Date(Date.now() + 86400000),
				revokedAt: null,
				rotatedAt: null,
				createdAt: new Date(),
			});

			const result = await service.exchangeAuthorizationCode({
				code: 'auth-code',
				codeVerifier: verifier,
				clientId: 'client-1',
				redirectUri: 'https://example.com/cb',
				resource: MCP_URL,
			});

			expect(result.accessToken).toBe('mocked-access-token');
			expect(result.refreshToken).toBeTruthy();
			expect(result.scope).toBe(record.scope);
			expect(result.expiresIn).toBeGreaterThan(0);
		});

		it('should throw BadRequestException when code is not found or expired', async () => {
			mockCodeStore.findAndConsume.mockResolvedValue(null);

			await expect(
				service.exchangeAuthorizationCode({
					code: 'invalid',
					codeVerifier: 'v',
					clientId: 'client-1',
					redirectUri: 'https://example.com/cb',
					resource: MCP_URL,
				}),
			).rejects.toThrow(BadRequestException);
		});

		it('should throw BadRequestException when PKCE code_verifier is invalid', async () => {
			const verifier = 'correct-verifier';
			const challenge = makeChallenge(verifier);
			const record = { ...baseRecord, codeChallenge: challenge };
			mockCodeStore.findAndConsume.mockResolvedValue(record);

			await expect(
				service.exchangeAuthorizationCode({
					code: 'auth-code',
					codeVerifier: 'wrong-verifier',
					clientId: 'client-1',
					redirectUri: 'https://example.com/cb',
					resource: MCP_URL,
				}),
			).rejects.toThrow(BadRequestException);
		});

		it('should throw BadRequestException when client_id does not match', async () => {
			const verifier = 'verifier-abc';
			const challenge = makeChallenge(verifier);
			mockCodeStore.findAndConsume.mockResolvedValue({ ...baseRecord, codeChallenge: challenge });

			await expect(
				service.exchangeAuthorizationCode({
					code: 'auth-code',
					codeVerifier: verifier,
					clientId: 'different-client',
					redirectUri: 'https://example.com/cb',
					resource: MCP_URL,
				}),
			).rejects.toThrow(BadRequestException);
		});

		it('should throw BadRequestException when redirect_uri does not match', async () => {
			const verifier = 'verifier-xyz';
			const challenge = makeChallenge(verifier);
			mockCodeStore.findAndConsume.mockResolvedValue({ ...baseRecord, codeChallenge: challenge });

			await expect(
				service.exchangeAuthorizationCode({
					code: 'auth-code',
					codeVerifier: verifier,
					clientId: 'client-1',
					redirectUri: 'https://other.example.com/cb',
					resource: MCP_URL,
				}),
			).rejects.toThrow(BadRequestException);
		});

		it('should pass aud=resource to JWT sign when resource matches', async () => {
			const verifier = 'good-verifier';
			const challenge = makeChallenge(verifier);
			mockCodeStore.findAndConsume.mockResolvedValue({ ...baseRecord, codeChallenge: challenge });
			mockRefreshStore.create.mockResolvedValue({
				id: 'rt-1',
				tokenHash: 'h',
				clientId: 'client-1',
				userId: 'user-1',
				scope: 'memo:read memo:write',
				expiresAt: new Date(Date.now() + 86400000),
				revokedAt: null,
				rotatedAt: null,
				createdAt: new Date(),
			});

			await service.exchangeAuthorizationCode({
				code: 'auth-code',
				codeVerifier: verifier,
				clientId: 'client-1',
				redirectUri: 'https://example.com/cb',
				resource: MCP_URL,
			});

			expect(mockJwtService.sign).toHaveBeenCalledWith(
				expect.objectContaining({ aud: MCP_URL, token_use: 'mcp' }),
				expect.any(Object),
			);
		});
	});

	// =================== 4.4 Token: refresh_token grant ===================

	describe('exchangeRefreshToken', () => {
		const plainToken = 'some-plain-refresh-token-value';
		const tokenHash = createHash('sha256').update(plainToken).digest('hex');

		const validRecord = {
			id: 'rt-1',
			tokenHash,
			clientId: 'client-1',
			userId: 'user-1',
			scope: 'memo:read',
			expiresAt: new Date(Date.now() + 86400000),
			revokedAt: null,
			rotatedAt: null,
			createdAt: new Date(),
		};

		it('should rotate refresh token and return new tokens', async () => {
			mockRefreshStore.findByHash.mockResolvedValue(validRecord);
			mockRefreshStore.rotate.mockResolvedValue({ ...validRecord, id: 'rt-2' });

			const result = await service.exchangeRefreshToken({
				refreshToken: plainToken,
				clientId: 'client-1',
			});

			expect(result.accessToken).toBe('mocked-access-token');
			expect(result.refreshToken).toBeTruthy();
			expect(result.refreshToken).not.toBe(plainToken);
			expect(mockRefreshStore.rotate).toHaveBeenCalledWith(
				validRecord,
				expect.any(String),
				expect.any(Date),
			);
		});

		it('should throw UnauthorizedException when refresh token not found', async () => {
			mockRefreshStore.findByHash.mockResolvedValue(null);

			await expect(
				service.exchangeRefreshToken({ refreshToken: 'invalid', clientId: 'client-1' }),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when refresh token is revoked', async () => {
			mockRefreshStore.findByHash.mockResolvedValue({ ...validRecord, revokedAt: new Date() });

			await expect(
				service.exchangeRefreshToken({ refreshToken: plainToken, clientId: 'client-1' }),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when refresh token is expired', async () => {
			mockRefreshStore.findByHash.mockResolvedValue({
				...validRecord,
				expiresAt: new Date(Date.now() - 1000),
			});

			await expect(
				service.exchangeRefreshToken({ refreshToken: plainToken, clientId: 'client-1' }),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should throw BadRequestException when client_id does not match', async () => {
			mockRefreshStore.findByHash.mockResolvedValue(validRecord);

			await expect(
				service.exchangeRefreshToken({ refreshToken: plainToken, clientId: 'other-client' }),
			).rejects.toThrow(BadRequestException);
		});

		it('should hash the plain token when looking up by hash', async () => {
			mockRefreshStore.findByHash.mockResolvedValue(null);

			await expect(
				service.exchangeRefreshToken({ refreshToken: plainToken, clientId: 'client-1' }),
			).rejects.toThrow();

			const expectedHash = createHash('sha256').update(plainToken).digest('hex');
			expect(mockRefreshStore.findByHash).toHaveBeenCalledWith(expectedHash);
		});
	});

	// =================== issueAuthCode ===================

	describe('issueAuthCode', () => {
		it('should create an auth code and return it', async () => {
			mockCodeStore.create.mockResolvedValue({} as any);

			const result = await service.issueAuthCode({
				clientId: 'client-1',
				userId: 'user-1',
				redirectUri: 'https://example.com/cb',
				codeChallenge: 'challenge',
				scope: 'memo:read',
				resource: MCP_URL,
				state: 'my-state',
			});

			expect(result.code).toBeTruthy();
			expect(result.state).toBe('my-state');
			expect(mockCodeStore.create).toHaveBeenCalledWith(
				expect.objectContaining({
					clientId: 'client-1',
					userId: 'user-1',
					codeChallenge: 'challenge',
					scope: 'memo:read',
				}),
			);
		});

		it('should generate a unique code each call', async () => {
			mockCodeStore.create.mockResolvedValue({} as any);

			const r1 = await service.issueAuthCode({
				clientId: 'c',
				userId: 'u',
				redirectUri: 'https://x.com/cb',
				codeChallenge: 'ch',
				scope: 'memo:read',
				resource: MCP_URL,
			});
			const r2 = await service.issueAuthCode({
				clientId: 'c',
				userId: 'u',
				redirectUri: 'https://x.com/cb',
				codeChallenge: 'ch',
				scope: 'memo:read',
				resource: MCP_URL,
			});

			expect(r1.code).not.toBe(r2.code);
		});
	});
});

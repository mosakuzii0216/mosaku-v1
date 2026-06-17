import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenService } from './jwt.service';
import type { McpScope } from './jwt.service';

describe('JwtTokenService', () => {
	let service: JwtTokenService;

	const mockJwtService = {
		sign: jest.fn().mockReturnValue('mock-jwt-token'),
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [JwtTokenService, { provide: JwtService, useValue: mockJwtService }],
		}).compile();

		service = module.get<JwtTokenService>(JwtTokenService);
		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('generateTokens', () => {
		it('should return an accessToken', () => {
			mockJwtService.sign.mockReturnValue('generated-token');

			const result = service.generateTokens('user-id', 'user@example.com', 'USER');

			expect(result.accessToken).toBe('generated-token');
		});

		it('should sign JWT with correct payload (sub, email, role)', () => {
			service.generateTokens('user-id-123', 'user@example.com', 'ADMIN');

			expect(mockJwtService.sign).toHaveBeenCalledWith(
				expect.objectContaining({
					sub: 'user-id-123',
					email: 'user@example.com',
					role: 'ADMIN',
				}),
				expect.any(Object),
			);
		});

		it('should call sign once per generateTokens call', () => {
			service.generateTokens('id', 'email@example.com', 'USER');

			expect(mockJwtService.sign).toHaveBeenCalledTimes(1);
		});
	});

	describe('generateMcpAccessToken', () => {
		const AUD = 'https://api.example.com/mcp';

		it('should sign token with MCP-specific claims', () => {
			mockJwtService.sign.mockReturnValue('mcp-token');

			service.generateMcpAccessToken('user-1', ['memo:read'], AUD);

			expect(mockJwtService.sign).toHaveBeenCalledWith(
				expect.objectContaining({
					sub: 'user-1',
					aud: AUD,
					scope: 'memo:read',
					token_use: 'mcp',
				}),
				expect.objectContaining({ expiresIn: expect.any(String) }),
			);
		});

		it('should join multiple scopes with space', () => {
			service.generateMcpAccessToken('user-1', ['memo:read', 'memo:write'], AUD);

			expect(mockJwtService.sign).toHaveBeenCalledWith(
				expect.objectContaining({ scope: 'memo:read memo:write' }),
				expect.any(Object),
			);
		});

		it('should filter out invalid scopes', () => {
			service.generateMcpAccessToken('user-1', ['memo:read', 'invalid:scope' as McpScope], AUD);

			expect(mockJwtService.sign).toHaveBeenCalledWith(
				expect.objectContaining({ scope: 'memo:read' }),
				expect.any(Object),
			);
		});

		it('should throw when no valid scopes remain after filtering', () => {
			expect(() =>
				service.generateMcpAccessToken('user-1', ['invalid:scope' as McpScope], AUD),
			).toThrow();
		});

		it('should return the signed token string', () => {
			mockJwtService.sign.mockReturnValue('signed-mcp-token');

			const result = service.generateMcpAccessToken('user-1', ['memo:read'], AUD);

			expect(result).toBe('signed-mcp-token');
		});
	});
});

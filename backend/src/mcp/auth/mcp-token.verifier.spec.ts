import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { McpTokenVerifier } from './mcp-token.verifier';

const AUD = 'https://api.example.com/mcp';

const validPayload = {
	sub: 'user-1',
	aud: AUD,
	scope: 'memo:read memo:write',
	token_use: 'mcp' as const,
	exp: Math.floor(Date.now() / 1000) + 3600,
};

describe('McpTokenVerifier', () => {
	let verifier: McpTokenVerifier;
	const mockJwtService = { verify: jest.fn() };

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [McpTokenVerifier, { provide: JwtService, useValue: mockJwtService }],
		}).compile();

		verifier = module.get(McpTokenVerifier);
		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(verifier).toBeDefined();
	});

	describe('verify', () => {
		it('should return AuthenticatedMcpUser for a valid token', () => {
			mockJwtService.verify.mockReturnValue(validPayload);

			const result = verifier.verify('valid-token', AUD);

			expect(result.userId).toBe('user-1');
			expect(result.scopes).toContain('memo:read');
			expect(result.scopes).toContain('memo:write');
		});

		it('should throw UnauthorizedException when JWT signature verification fails', () => {
			mockJwtService.verify.mockImplementation(() => {
				throw new Error('invalid signature');
			});

			expect(() => verifier.verify('bad-token', AUD)).toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when token is expired', () => {
			mockJwtService.verify.mockImplementation(() => {
				throw new Error('jwt expired');
			});

			expect(() => verifier.verify('expired-token', AUD)).toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when token_use is not mcp', () => {
			mockJwtService.verify.mockReturnValue({ ...validPayload, token_use: 'rest' });

			expect(() => verifier.verify('rest-token', AUD)).toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when aud does not match expected audience', () => {
			mockJwtService.verify.mockReturnValue({
				...validPayload,
				aud: 'https://other.example.com/mcp',
			});

			expect(() => verifier.verify('token', AUD)).toThrow(UnauthorizedException);
		});

		it('should filter out invalid scopes and return only valid ones', () => {
			mockJwtService.verify.mockReturnValue({
				...validPayload,
				scope: 'memo:read invalid:scope other:scope',
			});

			const result = verifier.verify('token', AUD);

			expect(result.scopes).toEqual(['memo:read']);
		});

		it('should return empty scopes array when no valid scopes in token', () => {
			mockJwtService.verify.mockReturnValue({ ...validPayload, scope: 'invalid:scope' });

			const result = verifier.verify('token', AUD);

			expect(result.scopes).toHaveLength(0);
		});

		it('should pass the bearer token to JwtService.verify', () => {
			mockJwtService.verify.mockReturnValue(validPayload);

			verifier.verify('my-bearer-token', AUD);

			expect(mockJwtService.verify).toHaveBeenCalledWith('my-bearer-token', expect.any(Object));
		});
	});
});

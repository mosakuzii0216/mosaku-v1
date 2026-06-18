import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OAuthController } from './oauth.controller';
import { McpOAuthService } from './mcp-oauth.service';
import { ConfigService } from '../../config/config.service';
import { McpFeatureFlagGuard } from '../mcp-feature-flag.guard';
import type { McpSessionRequest } from './oauth.controller';

const BACKEND_URL = 'https://api.example.com';
const MCP_URL = `${BACKEND_URL}/mcp`;

const mockOAuthService = {
	registerClient: jest.fn(),
	issueAuthCode: jest.fn(),
	exchangeAuthorizationCode: jest.fn(),
	exchangeRefreshToken: jest.fn(),
};

const mockConfig = {
	backendUrl: BACKEND_URL,
	mcpCanonicalUrl: MCP_URL,
};

function makeMockRes() {
	const res = {
		status: jest.fn().mockReturnThis(),
		send: jest.fn().mockReturnThis(),
		redirect: jest.fn().mockReturnThis(),
		setHeader: jest.fn().mockReturnThis(),
	};
	return res;
}

function makeMockReq(sessionOverrides: Record<string, unknown> = {}) {
	return {
		session: { ...sessionOverrides },
		query: {},
		body: {},
	} as unknown as McpSessionRequest;
}

describe('OAuthController', () => {
	let controller: OAuthController;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [OAuthController],
			providers: [
				{ provide: McpOAuthService, useValue: mockOAuthService },
				{ provide: ConfigService, useValue: mockConfig },
			],
		})
			.overrideGuard(McpFeatureFlagGuard)
			.useValue({ canActivate: () => true })
			.compile();

		controller = module.get<OAuthController>(OAuthController);
		jest.clearAllMocks();
	});

	// =================== 4.2 POST /oauth/register ===================

	describe('register (DCR)', () => {
		it('should return client_id and redirect_uris on success', async () => {
			mockOAuthService.registerClient.mockResolvedValue({
				id: 'client-1',
				clientName: 'Test',
				redirectUris: ['https://example.com/cb'],
				grantTypes: ['authorization_code', 'refresh_token'],
				tokenEndpointAuthMethod: 'none',
			});

			const result = await controller.register({
				client_name: 'Test',
				redirect_uris: ['https://example.com/cb'],
				grant_types: ['authorization_code', 'refresh_token'],
			});

			expect(result.client_id).toBe('client-1');
			expect(result.redirect_uris).toEqual(['https://example.com/cb']);
			expect(result.token_endpoint_auth_method).toBe('none');
		});

		it('should propagate BadRequestException from service', async () => {
			mockOAuthService.registerClient.mockRejectedValue(
				new BadRequestException('redirect_uri が不正です'),
			);

			await expect(controller.register({ redirect_uris: ['http://evil.com/cb'] })).rejects.toThrow(
				BadRequestException,
			);
		});

		it('should default grant_types when not provided', async () => {
			mockOAuthService.registerClient.mockResolvedValue({
				id: 'client-2',
				clientName: 'Unknown Client',
				redirectUris: ['https://example.com/cb'],
				grantTypes: ['authorization_code', 'refresh_token'],
				tokenEndpointAuthMethod: 'none',
			});

			await controller.register({ redirect_uris: ['https://example.com/cb'] });

			expect(mockOAuthService.registerClient).toHaveBeenCalledWith(
				expect.objectContaining({
					grantTypes: expect.arrayContaining(['authorization_code', 'refresh_token']),
				}),
			);
		});
	});

	// =================== 4.3 GET /oauth/authorize ===================

	describe('authorize', () => {
		const validQuery = {
			client_id: 'client-1',
			redirect_uri: 'https://example.com/cb',
			code_challenge: 'some-challenge',
			scope: 'memo:read',
			state: 'state-123',
			resource: MCP_URL,
		};

		it('should render login page when mcpUserId is not in session', async () => {
			const req = makeMockReq({});
			const res = makeMockRes();

			await controller.authorize(validQuery, req, res as any);

			expect(res.send).toHaveBeenCalled();
			const sentHtml: string = res.send.mock.calls[0][0] as string;
			expect(sentHtml).toContain('login-start');
		});

		it('should render consent page when mcpUserId is set in session', async () => {
			const req = makeMockReq({ mcpUserId: 'user-1' });
			const res = makeMockRes();

			await controller.authorize(validQuery, req, res as any);

			expect(res.send).toHaveBeenCalled();
			const sentHtml: string = res.send.mock.calls[0][0] as string;
			expect(sentHtml).toContain('/oauth/authorize/consent');
		});

		it('should store authorize params in session', async () => {
			const req = makeMockReq({});
			const res = makeMockRes();

			await controller.authorize(validQuery, req, res as any);

			const session = req.session as unknown as Record<string, unknown>;
			expect(session.mcpAuthorizeParams).toBeDefined();
			expect((session.mcpAuthorizeParams as Record<string, string>).clientId).toBe('client-1');
		});

		it('should return 400 when required params are missing', async () => {
			const req = makeMockReq({});
			const res = makeMockRes();

			await controller.authorize({ client_id: 'x' }, req, res as any);

			expect(res.status).toHaveBeenCalledWith(400);
		});
	});

	// =================== 4.3 GET /oauth/authorize/login-start/:provider ===================

	describe('loginStart', () => {
		it('should set mcpAuthorizeReturn in session and redirect to social login', () => {
			const req = makeMockReq({});
			const res = makeMockRes();

			controller.loginStart('google', req, res as any);

			const session = req.session as unknown as Record<string, unknown>;
			expect(session.mcpAuthorizeReturn).toBeTruthy();
			expect(res.redirect).toHaveBeenCalledWith('/auth/google');
		});

		it('should return 400 for unknown provider', () => {
			const req = makeMockReq({});
			const res = makeMockRes();

			controller.loginStart('evil-provider', req, res as any);

			expect(res.status).toHaveBeenCalledWith(400);
		});

		it('should accept github and line as valid providers', () => {
			['github', 'line'].forEach((provider) => {
				const req = makeMockReq({});
				const res = makeMockRes();
				controller.loginStart(provider, req, res as any);
				expect(res.redirect).toHaveBeenCalledWith(`/auth/${provider}`);
			});
		});
	});

	// =================== 4.3 POST /oauth/authorize/consent ===================

	describe('consent', () => {
		const authorizeParams = {
			clientId: 'client-1',
			redirectUri: 'https://example.com/cb',
			codeChallenge: 'challenge',
			scope: 'memo:read',
			state: 'state-xyz',
			resource: MCP_URL,
		};

		it('should issue code and redirect on approve', async () => {
			const req = makeMockReq({
				mcpUserId: 'user-1',
				mcpAuthorizeParams: authorizeParams,
			});
			const res = makeMockRes();

			mockOAuthService.issueAuthCode.mockResolvedValue({ code: 'auth-code', state: 'state-xyz' });

			await controller.consent({ action: 'approve' }, req, res as any);

			expect(mockOAuthService.issueAuthCode).toHaveBeenCalledWith(
				expect.objectContaining({ clientId: 'client-1', userId: 'user-1' }),
			);
			expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('code=auth-code'));
		});

		it('should redirect with access_denied on deny', async () => {
			const req = makeMockReq({
				mcpUserId: 'user-1',
				mcpAuthorizeParams: authorizeParams,
			});
			const res = makeMockRes();

			await controller.consent({ action: 'deny' }, req, res as any);

			expect(mockOAuthService.issueAuthCode).not.toHaveBeenCalled();
			expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('error=access_denied'));
		});

		it('should redirect with state when state is set', async () => {
			const req = makeMockReq({
				mcpUserId: 'user-1',
				mcpAuthorizeParams: authorizeParams,
			});
			const res = makeMockRes();

			mockOAuthService.issueAuthCode.mockResolvedValue({ code: 'code-1', state: 'state-xyz' });

			await controller.consent({ action: 'approve' }, req, res as any);

			expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('state=state-xyz'));
		});

		it('should return 400 when session is missing userId or params', async () => {
			const req = makeMockReq({});
			const res = makeMockRes();

			await controller.consent({ action: 'approve' }, req, res as any);

			expect(res.status).toHaveBeenCalledWith(400);
		});

		it('should clear mcpUserId and mcpAuthorizeParams from session after consent', async () => {
			const req = makeMockReq({
				mcpUserId: 'user-1',
				mcpAuthorizeParams: authorizeParams,
			});
			const res = makeMockRes();

			mockOAuthService.issueAuthCode.mockResolvedValue({ code: 'code', state: undefined });

			await controller.consent({ action: 'approve' }, req, res as any);

			const session = req.session as unknown as Record<string, unknown>;
			expect(session.mcpUserId).toBeUndefined();
			expect(session.mcpAuthorizeParams).toBeUndefined();
		});
	});

	// =================== 4.4 POST /oauth/token ===================

	describe('token', () => {
		it('should exchange authorization_code grant and return tokens', async () => {
			mockOAuthService.exchangeAuthorizationCode.mockResolvedValue({
				accessToken: 'access-token',
				refreshToken: 'refresh-token',
				expiresIn: 3600,
				scope: 'memo:read',
			});

			const result = await controller.token({
				grant_type: 'authorization_code',
				code: 'auth-code',
				code_verifier: 'verifier',
				client_id: 'client-1',
				redirect_uri: 'https://example.com/cb',
			});

			expect(result.access_token).toBe('access-token');
			expect(result.token_type).toBe('Bearer');
			expect(result.refresh_token).toBe('refresh-token');
			expect(result.expires_in).toBe(3600);
		});

		it('should exchange refresh_token grant and return rotated tokens', async () => {
			mockOAuthService.exchangeRefreshToken.mockResolvedValue({
				accessToken: 'new-at',
				refreshToken: 'new-rt',
				expiresIn: 3600,
				scope: 'memo:read',
			});

			const result = await controller.token({
				grant_type: 'refresh_token',
				refresh_token: 'old-rt',
				client_id: 'client-1',
			});

			expect(result.access_token).toBe('new-at');
			expect(result.refresh_token).toBe('new-rt');
		});

		it('should throw BadRequestException for unsupported grant_type', async () => {
			await expect(controller.token({ grant_type: 'implicit' })).rejects.toThrow(
				BadRequestException,
			);
		});

		it('should throw BadRequestException when authorization_code params are missing', async () => {
			await expect(
				controller.token({ grant_type: 'authorization_code', code: 'c' }),
			).rejects.toThrow(BadRequestException);
		});

		it('should throw BadRequestException when refresh_token params are missing', async () => {
			await expect(controller.token({ grant_type: 'refresh_token' })).rejects.toThrow(
				BadRequestException,
			);
		});

		it('should default resource to mcpCanonicalUrl when not provided', async () => {
			mockOAuthService.exchangeAuthorizationCode.mockResolvedValue({
				accessToken: 'at',
				refreshToken: 'rt',
				expiresIn: 3600,
				scope: 'memo:read',
			});

			await controller.token({
				grant_type: 'authorization_code',
				code: 'c',
				code_verifier: 'v',
				client_id: 'client-1',
				redirect_uri: 'https://example.com/cb',
			});

			expect(mockOAuthService.exchangeAuthorizationCode).toHaveBeenCalledWith(
				expect.objectContaining({ resource: MCP_URL }),
			);
		});
	});
});

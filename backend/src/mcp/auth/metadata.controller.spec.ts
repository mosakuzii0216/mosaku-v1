import { Test, TestingModule } from '@nestjs/testing';
import { MetadataController } from './metadata.controller';
import { McpFeatureFlagGuard } from '../mcp-feature-flag.guard';
import { ConfigService } from '../../config/config.service';

const BACKEND_URL = 'https://api.example.com';

describe('MetadataController', () => {
	let controller: MetadataController;

	const mockConfig = {
		backendUrl: BACKEND_URL,
		mcpCanonicalUrl: `${BACKEND_URL}/mcp`,
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [MetadataController],
			providers: [{ provide: ConfigService, useValue: mockConfig }, McpFeatureFlagGuard],
		}).compile();

		controller = module.get<MetadataController>(MetadataController);
	});

	describe('getProtectedResourceMetadata', () => {
		it('should return resource URI pointing to MCP canonical URL', () => {
			const result = controller.getProtectedResourceMetadata();
			expect(result.resource).toBe(`${BACKEND_URL}/mcp`);
		});

		it('should include authorization_servers pointing to AS well-known endpoint', () => {
			const result = controller.getProtectedResourceMetadata();
			expect(result.authorization_servers).toContain(
				`${BACKEND_URL}/.well-known/oauth-authorization-server`,
			);
		});

		it('should list memo:read and memo:write as supported scopes', () => {
			const result = controller.getProtectedResourceMetadata();
			expect(result.scopes_supported).toEqual(['memo:read', 'memo:write']);
		});
	});

	describe('getAuthorizationServerMetadata', () => {
		it('should return correct issuer matching backend URL', () => {
			const result = controller.getAuthorizationServerMetadata();
			expect(result.issuer).toBe(BACKEND_URL);
		});

		it('should include authorization_endpoint at /oauth/authorize', () => {
			const result = controller.getAuthorizationServerMetadata();
			expect(result.authorization_endpoint).toBe(`${BACKEND_URL}/oauth/authorize`);
		});

		it('should include token_endpoint at /oauth/token', () => {
			const result = controller.getAuthorizationServerMetadata();
			expect(result.token_endpoint).toBe(`${BACKEND_URL}/oauth/token`);
		});

		it('should include registration_endpoint at /oauth/register', () => {
			const result = controller.getAuthorizationServerMetadata();
			expect(result.registration_endpoint).toBe(`${BACKEND_URL}/oauth/register`);
		});

		it('should advertise only S256 as code_challenge_method (MCP spec MUST)', () => {
			const result = controller.getAuthorizationServerMetadata();
			expect(result.code_challenge_methods_supported).toEqual(['S256']);
		});

		it('should list memo:read and memo:write as scopes_supported', () => {
			const result = controller.getAuthorizationServerMetadata();
			expect(result.scopes_supported).toEqual(['memo:read', 'memo:write']);
		});

		it('should support authorization_code and refresh_token grant types', () => {
			const result = controller.getAuthorizationServerMetadata();
			expect(result.grant_types_supported).toContain('authorization_code');
			expect(result.grant_types_supported).toContain('refresh_token');
		});
	});
});

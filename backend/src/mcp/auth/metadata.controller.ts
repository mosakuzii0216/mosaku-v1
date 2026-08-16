import { Controller, Get, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { McpFeatureFlagGuard } from '../mcp-feature-flag.guard';
import { ConfigService } from '../../config/config.service';

/**
 * RFC 9728 (Protected Resource Metadata) / RFC 8414 (AS Metadata) を公開するコントローラ。
 * MCP クライアントの自動接続（discovery）に必要。すべて @Public()。
 * McpFeatureFlagGuard で feature flag OFF 時は 404 にし、MCP 入口を完全無効化する（R1.6）。
 */
@Public()
@Controller()
@UseGuards(McpFeatureFlagGuard)
export class MetadataController {
	constructor(private readonly config: ConfigService) {}

	/** RFC 9728: Protected Resource Metadata — MCP クライアントが最初に取得するドキュメント。 */
	@Get('.well-known/oauth-protected-resource')
	getProtectedResourceMetadata() {
		const base = this.config.backendUrl;
		return {
			resource: this.config.mcpCanonicalUrl,
			authorization_servers: [`${base}/.well-known/oauth-authorization-server`],
			scopes_supported: ['memo:read', 'memo:write'],
		};
	}

	/** RFC 8414: Authorization Server Metadata — authorize/token/register エンドポイントと PKCE 方式を広告。 */
	@Get('.well-known/oauth-authorization-server')
	getAuthorizationServerMetadata() {
		const base = this.config.backendUrl;
		return {
			issuer: base,
			authorization_endpoint: `${base}/oauth/authorize`,
			token_endpoint: `${base}/oauth/token`,
			registration_endpoint: `${base}/oauth/register`,
			scopes_supported: ['memo:read', 'memo:write'],
			response_types_supported: ['code'],
			grant_types_supported: ['authorization_code', 'refresh_token'],
			code_challenge_methods_supported: ['S256'],
			token_endpoint_auth_methods_supported: ['none'],
		};
	}
}

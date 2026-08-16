import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { ConfigService } from '../../config/config.service';
import { McpTokenVerifier } from './mcp-token.verifier';
import type { AuthenticatedMcpUser } from './mcp-token.verifier';

/** request オブジェクトへの注入キー。 */
export const MCP_USER_KEY = 'mcpUser' as const;

export interface McpAuthenticatedRequest extends ExpressRequest {
	[MCP_USER_KEY]: AuthenticatedMcpUser;
}

/**
 * MCP エンドポイントの Bearer トークンを検証し、認証ユーザーを request に注入するガード。
 *
 * - グローバル JwtAuthGuard は @Public() で opt-out 済みのため、本ガードが MCP の認証を担う（R1.6）。
 * - 失敗時は 401 + WWW-Authenticate（resource_metadata + scope）を返し、クライアントに
 *   discovery 起点を提示する（MCP 仕様 MUST / R2.2）。
 * - token_use !== 'mcp' は REST ログイントークンの passthrough を防ぐ（R2.2）。
 */
@Injectable()
export class McpBearerGuard implements CanActivate {
	constructor(
		private readonly verifier: McpTokenVerifier,
		private readonly config: ConfigService,
	) {}

	canActivate(context: ExecutionContext): boolean {
		const http = context.switchToHttp();
		const req = http.getRequest<ExpressRequest>();
		const res = http.getResponse<ExpressResponse>();

		const authHeader = req.headers.authorization;
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			this.setWwwAuthenticate(res);
			throw new UnauthorizedException('Authorization: Bearer <token> ヘッダが必要です。');
		}

		const token = authHeader.slice('Bearer '.length);
		try {
			const user = this.verifier.verify(token, this.config.mcpCanonicalUrl);
			(req as McpAuthenticatedRequest)[MCP_USER_KEY] = user;
			return true;
		} catch {
			this.setWwwAuthenticate(res);
			throw new UnauthorizedException('MCP トークンが無効です。');
		}
	}

	private setWwwAuthenticate(res: ExpressResponse): void {
		const resourceMetadata = `${this.config.backendUrl}/.well-known/oauth-protected-resource`;
		res.setHeader(
			'WWW-Authenticate',
			`Bearer resource_metadata="${resourceMetadata}", scope="memo:read memo:write"`,
		);
	}
}

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from './types';
import { JWT_EXPIRATION, MCP_ACCESS_TOKEN_EXPIRATION } from '../config/auth-constants';

export interface JwtPayload {
	sub: string; // user.id
	email: string;
	role: UserRole;
	iat?: number;
	exp?: number;
}

export interface AuthTokens {
	accessToken: string;
	refreshToken?: string;
}

/** MCP で有効なスコープ（ホワイトリスト）。 */
export type McpScope = 'memo:read' | 'memo:write';

const MCP_VALID_SCOPES = new Set<string>(['memo:read', 'memo:write']);

/** MCP 専用アクセストークンのペイロード。REST 用トークンとは token_use + aud で相互排他。 */
export interface McpAccessTokenPayload {
	sub: string;
	aud: string;
	scope: string;
	token_use: 'mcp';
	iat?: number;
	exp?: number;
}

@Injectable()
export class JwtTokenService {
	constructor(private readonly jwtService: JwtService) {}

	generateTokens(userId: string, email: string, role: UserRole): AuthTokens {
		const payload: JwtPayload = { sub: userId, email, role };
		const accessToken = this.jwtService.sign(payload, { expiresIn: JWT_EXPIRATION });
		return { accessToken };
	}

	/**
	 * MCP 専用アクセストークンを発行する。
	 * REST 用 generateTokens とは別メソッド: aud / scope / token_use=mcp が必須クレームであり
	 * 既存のペイロード（sub/email/role）とは相互排他（design Issue 2）。
	 */
	generateMcpAccessToken(userId: string, scopes: McpScope[], audience: string): string {
		const validScopes = scopes.filter((s) => MCP_VALID_SCOPES.has(s));
		if (validScopes.length === 0) {
			throw new Error('少なくとも 1 つの有効な MCP スコープ（memo:read / memo:write）が必要です。');
		}

		const payload: McpAccessTokenPayload = {
			sub: userId,
			aud: audience,
			scope: validScopes.join(' '),
			token_use: 'mcp',
		};

		return this.jwtService.sign(payload, { expiresIn: MCP_ACCESS_TOKEN_EXPIRATION });
	}
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { McpAccessTokenPayload, McpScope } from '../../auth/jwt.service';

const MCP_VALID_SCOPES = new Set<string>(['memo:read', 'memo:write']);

/** McpBearerGuard が controller に注入するユーザー情報。 */
export interface AuthenticatedMcpUser {
	userId: string;
	scopes: ReadonlyArray<McpScope>;
}

/**
 * MCP 専用 JWT 検証器。
 *
 * REST 用の JwtStrategy（passport-jwt）は aud / token_use を見ないため、
 * MCP 固有クレームの検証は本クラスで完結させる（design Issue 2）。
 * 署名は既存 JWT_SECRET 鍵を共有する（JwtModule を McpAuthModule で独立登録）。
 */
@Injectable()
export class McpTokenVerifier {
	constructor(private readonly jwtService: JwtService) {}

	/**
	 * Bearer トークンを検証し、AuthenticatedMcpUser を返す。
	 * 以下のいずれかで UnauthorizedException を投げる:
	 *   - 署名不正・期限切れ（JwtService.verify 例外）
	 *   - token_use !== 'mcp'（REST ログイントークンによる passthrough 防止）
	 *   - aud !== expectedAudience（audience バインディング違反, RFC 8707）
	 */
	verify(bearer: string, expectedAudience: string): AuthenticatedMcpUser {
		let payload: McpAccessTokenPayload;
		try {
			// audience 検証は後続で手動実施するため ignoreExpiration:false のみ（既定）
			payload = this.jwtService.verify<McpAccessTokenPayload>(bearer, {
				// aud は自前で照合するため @nestjs/jwt の audience オプションを使わない
			});
		} catch {
			throw new UnauthorizedException('MCP トークンが無効または期限切れです。');
		}

		if (payload.token_use !== 'mcp') {
			throw new UnauthorizedException(
				'REST ログイントークンは MCP エンドポイントで使用できません。',
			);
		}

		if (payload.aud !== expectedAudience) {
			throw new UnauthorizedException('トークンの audience が MCP サーバーと一致しません。');
		}

		const scopes = (payload.scope ?? '')
			.split(' ')
			.filter((s) => MCP_VALID_SCOPES.has(s)) as McpScope[];

		return { userId: payload.sub, scopes };
	}
}

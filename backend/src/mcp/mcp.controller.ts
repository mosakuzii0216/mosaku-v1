import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { McpServerService } from './mcp-server.service';
import { McpFeatureFlagGuard } from './mcp-feature-flag.guard';
import { McpBearerGuard, MCP_USER_KEY } from './auth/mcp-bearer.guard';
import type { AuthenticatedMcpUser } from './auth/mcp-token.verifier';
import { THROTTLE_CONFIG } from '../config/auth-constants';

/**
 * MCP Streamable HTTP エンドポイント。
 *
 * - `@Public()` でグローバル JWT Guard を opt-out し、MCP 独自 Guard チェーンへ委ねる（R1.6）。
 * - McpFeatureFlagGuard: flag OFF → 404（認証前に即時無効化）
 * - McpBearerGuard: Bearer 検証 → 無効なら 401 + WWW-Authenticate（R2.2）
 * - ボディは Express の JSON パーサ済み `req.body` を transport へ渡す（design Issue 3）。
 */
@Public()
@Controller('mcp')
export class McpController {
	constructor(private readonly mcpServerService: McpServerService) {}

	/**
	 * POST/GET/DELETE をまとめて transport へ委譲する。
	 * Guard チェーン: McpFeatureFlagGuard → McpBearerGuard → handler。
	 * メソッド別の許否（GET の 405 等）は SDK transport が判定する。
	 * @Throttle で MCP 専用レート制限を適用（グローバル GLOBAL より厳しい値）（R6.1）。
	 */
	@All()
	@UseGuards(McpFeatureFlagGuard, McpBearerGuard)
	@Throttle({ default: { limit: THROTTLE_CONFIG.MCP.LIMIT, ttl: THROTTLE_CONFIG.MCP.TTL } })
	async handle(@Req() req: ExpressRequest, @Res() res: ExpressResponse): Promise<void> {
		const user = (req as ExpressRequest & { [MCP_USER_KEY]: AuthenticatedMcpUser })[MCP_USER_KEY];
		await this.mcpServerService.handle(req, res, user);
	}
}

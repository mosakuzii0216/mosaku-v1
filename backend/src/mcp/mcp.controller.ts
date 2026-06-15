import { All, Controller, NotFoundException, Req, Res } from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { isFeatureEnabled } from '../config/features.config';
import { McpServerService } from './mcp-server.service';

/**
 * MCP Streamable HTTP エンドポイント。
 *
 * - `@Public()` でグローバル JWT Guard を opt-out し、MCP 独自の Bearer 検証（task 3）に委ねる。
 *   既存 REST の認証・挙動には影響しない（R1.6）。
 * - feature flag（FEATURE_MCP_ENDPOINT）が off の場合は入口を無効化（404）。
 *   flag off のまま本番デプロイでき、即時ロールバックできる。
 * - ボディは Express の JSON パーサ済み `req.body` を transport へ渡す（design Issue 3）。
 */
@Public()
@Controller('mcp')
export class McpController {
	constructor(private readonly mcpServerService: McpServerService) {}

	/**
	 * POST/GET/DELETE をまとめて transport へ委譲する。
	 * メソッド別の許否（GET の 405 等）は SDK transport が判定する。
	 */
	@All()
	async handle(@Req() req: ExpressRequest, @Res() res: ExpressResponse): Promise<void> {
		if (!isFeatureEnabled('MCP_ENDPOINT')) {
			// 入口を完全に無効化（ルート不在として振る舞う）
			throw new NotFoundException();
		}
		await this.mcpServerService.handle(req, res);
	}
}

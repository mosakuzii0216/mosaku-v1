import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { McpController } from './mcp.controller';
import { McpServerService } from './mcp-server.service';

/**
 * MCP（Model Context Protocol）ドメインモジュール。
 *
 * 「1 ドメイン = 1 モジュール」規約に従い、MCP プロトコル層を独立モジュールとして登録する。
 * OAuth 認可サーバー層（McpAuthModule）は後続タスクで配下に追加する。
 * 入口の有効/無効は feature flag（FEATURE_MCP_ENDPOINT）で制御する。
 */
@Module({
	imports: [ConfigModule],
	controllers: [McpController],
	providers: [McpServerService],
})
export class McpModule {}

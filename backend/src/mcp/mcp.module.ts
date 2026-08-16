import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { McpController } from './mcp.controller';
import { McpServerService } from './mcp-server.service';
import { McpFeatureFlagGuard } from './mcp-feature-flag.guard';
import { McpAuthModule } from './auth/mcp-auth.module';
import { MemoModule } from '../memo/memo.module';
import { NotebookModule } from '../notebook/notebook.module';
import { CommonModule } from '../common/common.module';
import { CreateMemoTool } from './tools/create-memo.tool';
import { SearchMemosTool } from './tools/search-memos.tool';

/**
 * MCP（Model Context Protocol）ドメインモジュール。
 *
 * 「1 ドメイン = 1 モジュール」規約に従い、MCP プロトコル層を独立モジュールとして登録する。
 * 入口の有効/無効は feature flag（FEATURE_MCP_ENDPOINT）で制御する。
 */
@Module({
	imports: [ConfigModule, McpAuthModule, MemoModule, NotebookModule, CommonModule],
	controllers: [McpController],
	providers: [McpServerService, McpFeatureFlagGuard, CreateMemoTool, SearchMemosTool],
})
export class McpModule {}

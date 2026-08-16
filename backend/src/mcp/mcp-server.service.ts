import { Injectable } from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import type { ZodRawShape } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ConfigService } from '../config/config.service';
import { MCP_SERVER_INFO } from './mcp.constants';
import { CREATE_MEMO_TOOL, SEARCH_MEMOS_TOOL } from './mcp.tools';
import type { AuthenticatedMcpUser } from './auth/mcp-token.verifier';
import { CreateMemoTool } from './tools/create-memo.tool';
import { SearchMemosTool } from './tools/search-memos.tool';

/**
 * `McpServer.registerTool` は zod shape を深く型展開するため、literal な inputSchema を渡すと
 * TS2589（型インスタンス化が深すぎ）を引き起こす。登録は非ジェネリックなシグネチャへキャストして行う。
 */
type RegisterTool = (
	name: string,
	config: { title: string; description: string; inputSchema: ZodRawShape },
	cb: (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>,
) => void;

/**
 * MCP Streamable HTTP のリクエスト処理を担うサービス。
 *
 * Cloud Run のステートレス前提に合わせ、リクエスト毎に `McpServer` + transport を生成して破棄する
 * （セッション ID 非生成 = `sessionIdGenerator: undefined`）。
 * NestJS/Express が既にパースした JSON ボディを `handleRequest` の第 3 引数へ渡し、
 * transport によるボディ二重消費を避ける（design Issue 3）。
 */
@Injectable()
export class McpServerService {
	constructor(
		private readonly config: ConfigService,
		private readonly createMemoTool: CreateMemoTool,
		private readonly searchMemosTool: SearchMemosTool,
	) {}

	/**
	 * 1 件の MCP リクエストを処理する。レスポンス整形は SDK transport に委譲する。
	 * user は McpBearerGuard 検証済み。tool ハンドラへのクロージャ束縛は task 5 で実装。
	 */

	async handle(
		req: ExpressRequest,
		res: ExpressResponse,
		user: AuthenticatedMcpUser,
	): Promise<void> {
		const server = this.buildServer(user);
		const transport = new StreamableHTTPServerTransport({
			// ステートレス: セッションを保持しない
			sessionIdGenerator: undefined,
			// SSE ストリームではなく単一 JSON 応答を返す（Cloud Run ステートレス向き・テスト容易）
			enableJsonResponse: true,
			// DNS rebinding 対策（Host ヘッダ検証）
			enableDnsRebindingProtection: true,
			allowedHosts: this.config.mcpAllowedHosts,
		});

		// リクエスト終了時に server/transport を確実に破棄する
		res.on('close', () => {
			void transport.close();
			void server.close();
		});

		await server.connect(transport);
		// 既にパース済みのボディを渡してストリーム二重消費を回避する
		await transport.handleRequest(req, res, req.body);
	}

	/**
	 * 認証ユーザー文脈をクロージャ束縛した `McpServer` を構築する。
	 *
	 * userId の出所は認証文脈（user）のみ。クライアント入力で上書き不可。
	 * tool ハンドラは CreateMemoTool / SearchMemosTool に委譲（既存ドメインサービス直呼び）。
	 */
	private buildServer(user: AuthenticatedMcpUser): McpServer {
		const server = new McpServer(MCP_SERVER_INFO);
		// TS2589 回避: ZodRawShape を渡すと型推論が無限再帰するため非ジェネリックにキャスト
		const registerTool = server.registerTool.bind(server) as RegisterTool;

		registerTool(
			CREATE_MEMO_TOOL.name,
			{
				title: CREATE_MEMO_TOOL.title,
				description: CREATE_MEMO_TOOL.description,
				inputSchema: CREATE_MEMO_TOOL.inputShape,
			},
			(args) => this.createMemoTool.execute(args as { content: string; notebook?: string }, user),
		);

		registerTool(
			SEARCH_MEMOS_TOOL.name,
			{
				title: SEARCH_MEMOS_TOOL.title,
				description: SEARCH_MEMOS_TOOL.description,
				inputSchema: SEARCH_MEMOS_TOOL.inputShape,
			},
			(args) => this.searchMemosTool.execute(args as { query: string }, user),
		);

		return server;
	}
}

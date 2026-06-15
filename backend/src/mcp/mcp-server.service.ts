import { Injectable } from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import type { ZodRawShape } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ConfigService } from '../config/config.service';
import { MCP_SERVER_INFO } from './mcp.constants';
import { CREATE_MEMO_TOOL, SEARCH_MEMOS_TOOL } from './mcp.tools';

/**
 * `McpServer.registerTool` は zod shape を深く型展開するため、literal な inputSchema を渡すと
 * TS2589（型インスタンス化が深すぎ）を引き起こす。登録は非ジェネリックなシグネチャへキャストして行う。
 */
type RegisterTool = (
	name: string,
	config: { title: string; description: string; inputSchema: ZodRawShape },
	cb: () => CallToolResult,
) => void;

interface StubToolDef {
	name: string;
	title: string;
	description: string;
	inputShape: ZodRawShape;
}

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
	constructor(private readonly config: ConfigService) {}

	/**
	 * 1 件の MCP リクエストを処理する。レスポンス整形は SDK transport に委譲する。
	 */
	async handle(req: ExpressRequest, res: ExpressResponse): Promise<void> {
		const server = this.buildServer();
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
	 * 認証ユーザー文脈を束縛した `McpServer` を構築する。
	 *
	 * task 1（スパイク）では tool ハンドラはスタブ（未実装エラー結果）。
	 * `tools/list` で name / description / inputSchema を返す疎通までを担保する。
	 * 実ロジック（既存ドメインサービス直呼び）は task 5 で差し替える。
	 */
	private buildServer(): McpServer {
		const server = new McpServer(MCP_SERVER_INFO);

		server.registerTool(
			CREATE_MEMO_TOOL.name,
			{
				title: CREATE_MEMO_TOOL.title,
				description: CREATE_MEMO_TOOL.description,
				inputSchema: CREATE_MEMO_TOOL.inputShape,
			},
			() => this.notImplemented(CREATE_MEMO_TOOL.name),
		);

		server.registerTool(
			SEARCH_MEMOS_TOOL.name,
			{
				title: SEARCH_MEMOS_TOOL.title,
				description: SEARCH_MEMOS_TOOL.description,
				inputSchema: SEARCH_MEMOS_TOOL.inputShape,
			},
			() => this.notImplemented(SEARCH_MEMOS_TOOL.name),
		);

		return server;
	}

	/** task 1 段階の tool ハンドラ・スタブ。実装は task 5。 */
	private notImplemented(tool: string) {
		return {
			isError: true,
			content: [
				{
					type: 'text' as const,
					text: `tool "${tool}" は未実装です（task 5 で実装予定）。`,
				},
			],
		};
	}
}

import { Injectable } from '@nestjs/common';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MemoService } from '../../memo/memo.service';
import { MCP_SCOPES } from '../mcp.constants';
import type { AuthenticatedMcpUser } from '../auth/mcp-token.verifier';

export interface SearchMemosInput {
	query: string;
}

const MCP_SEARCH_LIMIT = 20;
const EXCERPT_MAX_CHARS = 300;

/**
 * search_memos MCP tool ハンドラ。
 *
 * - memo:read スコープ必須
 * - MemoService.searchPaginated で userId 限定 + trashedAt: null（ゴミ箱除外）
 * - 最大 20 件、本文は 300 文字で切り詰め
 * - 既存ドメインサービス直呼び（apiClient 非経由）
 */
@Injectable()
export class SearchMemosTool {
	constructor(private readonly memoService: MemoService) {}

	async execute(input: SearchMemosInput, user: AuthenticatedMcpUser): Promise<CallToolResult> {
		if (!user.scopes.includes(MCP_SCOPES.MEMO_READ)) {
			return this.errorResult('insufficient_scope: memo:read スコープが必要です。');
		}

		const { query } = input;

		let result: Awaited<ReturnType<typeof this.memoService.searchPaginated>>;
		try {
			result = await this.memoService.searchPaginated(query, user.userId, {
				page: 1,
				limit: MCP_SEARCH_LIMIT,
			});
		} catch {
			return this.errorResult('メモの検索中に内部エラーが発生しました。');
		}

		const memos = result.data.map((memo) => ({
			memoId: memo.id,
			title: memo.title,
			excerpt: (memo.contentText ?? '').slice(0, EXCERPT_MAX_CHARS),
			notebookId: memo.notebookId ?? null,
			updatedAt: memo.updatedAt.toISOString(),
		}));

		return {
			content: [
				{
					type: 'text' as const,
					text: JSON.stringify({ memos, total: memos.length }),
				},
			],
		};
	}

	private errorResult(text: string): CallToolResult {
		return {
			isError: true,
			content: [{ type: 'text' as const, text }],
		};
	}
}

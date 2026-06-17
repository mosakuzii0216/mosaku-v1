import { Injectable } from '@nestjs/common';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MemoService } from '../../memo/memo.service';
import { NotebookService } from '../../notebook/notebook.service';
import { MCP_SCOPES } from '../mcp.constants';
import type { AuthenticatedMcpUser } from '../auth/mcp-token.verifier';

export interface CreateMemoInput {
	content: string;
	notebook?: string;
}

const TITLE_MAX_CHARS = 80;

/**
 * create_memo MCP tool ハンドラ。
 *
 * - memo:write スコープ必須
 * - content 先頭行を ≤80 文字でタイトル自動生成（空なら "MCP メモ YYYY-MM-DD"）
 * - notebook 指定時は NotebookService.findOne で所有権検証（失敗はエラー結果）
 * - MemoService.create に委譲（既存ドメインサービス直呼び、apiClient 非経由）
 */
@Injectable()
export class CreateMemoTool {
	constructor(
		private readonly memoService: MemoService,
		private readonly notebookService: NotebookService,
	) {}

	async execute(input: CreateMemoInput, user: AuthenticatedMcpUser): Promise<CallToolResult> {
		if (!user.scopes.includes(MCP_SCOPES.MEMO_WRITE)) {
			return this.errorResult('insufficient_scope: memo:write スコープが必要です。');
		}

		const { content, notebook } = input;

		if (!content || content.trim().length === 0) {
			return this.errorResult('content は必須・非空です。');
		}

		let notebookId: string | undefined;
		if (notebook) {
			try {
				const nb = await this.notebookService.findOne(notebook, user.userId);
				notebookId = nb.id;
			} catch {
				return this.errorResult('notebook が存在しないか、所有権がありません。');
			}
		}

		const title = this.generateTitle(content);
		let memo: { id: string; title: string; notebookId: string | null };
		try {
			memo = await this.memoService.create({ title, content, notebookId }, user.userId);
		} catch {
			return this.errorResult('メモの作成中に内部エラーが発生しました。');
		}

		return {
			content: [
				{
					type: 'text' as const,
					text: JSON.stringify({
						memoId: memo.id,
						title: memo.title,
						notebookId: memo.notebookId ?? null,
					}),
				},
			],
		};
	}

	private generateTitle(content: string): string {
		const firstLine = content.split('\n')[0].trim();
		if (!firstLine) {
			const today = new Date().toISOString().slice(0, 10);
			return `MCP メモ ${today}`;
		}
		return Array.from(firstLine).slice(0, TITLE_MAX_CHARS).join('');
	}

	private errorResult(text: string): CallToolResult {
		return {
			isError: true,
			content: [{ type: 'text' as const, text }],
		};
	}
}

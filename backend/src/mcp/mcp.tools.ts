import { z, type ZodRawShape } from 'zod';
import { MCP_TOOL_NAMES } from './mcp.constants';

/**
 * MCP tool 定義（スパイク段のスタブ）。
 *
 * task 1 では `tools/list` の疎通までを担保するため、name / description / inputSchema を確定させる。
 * 実際の作成・検索ロジック（ハンドラ本体）は task 5 で既存ドメインサービス直呼びに差し替える。
 */

/**
 * create_memo の入力スキーマ（zod raw shape）。
 * `ZodRawShape` で型を広げ、SDK `registerTool` の深い型推論（TS2589）を回避する。
 */
export const CREATE_MEMO_INPUT_SHAPE: ZodRawShape = {
	content: z.string().min(1).describe('メモ本文。必須・非空。'),
	notebook: z
		.string()
		.optional()
		.describe('保存先ノートブックの ID。未指定なら既定の保存先（未分類）に作成する。'),
};

/** search_memos の入力スキーマ（zod raw shape）。 */
export const SEARCH_MEMOS_INPUT_SHAPE: ZodRawShape = {
	query: z.string().min(1).describe('検索クエリ。必須。'),
};

export const CREATE_MEMO_TOOL = {
	name: MCP_TOOL_NAMES.CREATE_MEMO,
	title: 'メモを作成',
	description:
		'AI との壁打ち結果を mosaku に新規メモとして保存する。content（必須）と notebook（任意）を受け取る。',
	inputShape: CREATE_MEMO_INPUT_SHAPE,
} as const;

export const SEARCH_MEMOS_TOOL = {
	name: MCP_TOOL_NAMES.SEARCH_MEMOS,
	title: 'メモを検索',
	description:
		'過去メモをキーワード検索して文脈に取り込む。自分が所有するメモのみが対象（ゴミ箱は除外）。',
	inputShape: SEARCH_MEMOS_INPUT_SHAPE,
} as const;

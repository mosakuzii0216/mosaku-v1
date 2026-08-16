/**
 * MCP サーバーのプロトコル定数。
 * tool 名や提供サーバー情報の単一の真実の源泉。
 */

/** MCP クライアントへ提示するサーバー情報（initialize レスポンスに含む）。 */
export const MCP_SERVER_INFO = {
	name: 'mosaku-mcp',
	version: '0.1.0',
} as const;

/** v1 で公開する tool 名。 */
export const MCP_TOOL_NAMES = {
	CREATE_MEMO: 'create_memo',
	SEARCH_MEMOS: 'search_memos',
} as const;

/** MCP で発行・検証するスコープ（memo read/write に限定）。 */
export const MCP_SCOPES = {
	MEMO_READ: 'memo:read',
	MEMO_WRITE: 'memo:write',
} as const;

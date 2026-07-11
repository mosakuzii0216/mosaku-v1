/**
 * セマンティックカラー識別子と表示ラベルの単一情報源（Req2.3）。
 *
 * `tokens.css` の和名コメント（`--editor-text-*` / `--editor-marker-*`）に対応し、
 * スラッシュコマンドの palette モード（`slashCommandItems.ts`）と選択時バブルメニュー
 * （`EditorBubbleMenu.tsx`）の双方から参照する。
 */
export interface SemanticColorSwatch {
	/** doc attrs へ永続化されるセマンティック識別子 */
	name: string;
	/** UI に表示するラベル */
	label: string;
}

export const TEXT_COLOR_SWATCHES: readonly SemanticColorSwatch[] = [
	{ name: 'wakaba', label: '若葉' },
	{ name: 'sora', label: '空' },
	{ name: 'kohaku', label: '琥珀' },
	{ name: 'sumire', label: '菫' },
];

export const MARKER_SWATCHES: readonly SemanticColorSwatch[] = [
	{ name: 'kiiro', label: '黄' },
	{ name: 'midori', label: '緑' },
	{ name: 'momo', label: '桃' },
	{ name: 'mizu', label: '水' },
];

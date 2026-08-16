import type { Editor } from '@tiptap/react';
import { TEXT_COLOR_SWATCHES, MARKER_SWATCHES } from './semanticPalette';

/** スラッシュコマンド実行時にエディタへ渡すコンテキスト */
export interface SlashCommandRunParams {
	editor: Editor;
	/** `/` ＋ クエリ文字列が占める範囲（確定時に削除する） */
	range: { from: number; to: number };
}

/** メニューの表示モード。doc には持たせず render/UI 層が保持する（Req3.5/5.3 の最難所） */
export type SlashCommandMode = 'root' | 'notebook' | 'palette';

/** palette モードの遷移先（テキスト色 or マーカー）。doc には持たせず render 層が保持する */
export type PaletteTarget = 'textColor' | 'marker';

/**
 * スラッシュコマンド1件の契約。
 *
 * - kind='block': `run` がブロック挿入を実行する。
 * - kind='notebook'（root モード）: ノートブック参照の遷移トリガー。`run` は doc を変更せず、
 *   render 層がサブメニューへ遷移する（Req3.5）。
 * - kind='notebook'（notebook モード）: 個々のノートブック。`run` が `[[name]]` を挿入する。
 * - kind='palette'（root モード）: テキスト色/マーカーの palette モード遷移トリガー。`run` は
 *   doc を変更せず、render 層が `paletteTarget` を見てサブメニューへ遷移する（Req5.3、Task 7.2）。
 * - kind='palette'（palette モード）: 個々のセマンティックカラースウォッチ。`run` が range 削除後
 *   stored mark（以降入力への適用）を有効化する（Req5.3）。
 */
export interface SlashCommandItem {
	title: string;
	description?: string;
	kind: 'block' | 'notebook' | 'palette';
	/** kind='palette' の root トリガー項目にのみ設定される遷移先（Task 7.2 が消費） */
	paletteTarget?: PaletteTarget;
	/** kind='palette' の palette モード項目にのみ設定される表示色（CSS 変数名） */
	swatchColorVar?: string;
	run: (params: SlashCommandRunParams) => void;
}

/** クエリ絞り込み用にキーワードを併せ持つコマンド定義 */
interface CommandDef {
	title: string;
	description: string;
	kind: 'block' | 'notebook' | 'palette';
	paletteTarget?: 'textColor' | 'marker';
	/** タイトル以外の前方一致・部分一致対象(英語別名・読みなど) */
	keywords: string[];
	run: (params: SlashCommandRunParams) => void;
}

/** ブロック挿入は range を削除してから、既存ツールバーと同一のコマンドで変換する（Req2.10/3.4） */
const blockDefs: CommandDef[] = [
	{
		title: '見出し1',
		description: '大見出し (H1)',
		kind: 'block',
		keywords: ['h1', 'heading', 'midashi', '見出し', '大見出し'],
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
	},
	{
		title: '見出し2',
		description: '中見出し (H2)',
		kind: 'block',
		keywords: ['h2', 'heading', 'midashi', '見出し', '中見出し'],
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
	},
	{
		title: '見出し3',
		description: '小見出し (H3)',
		kind: 'block',
		keywords: ['h3', 'heading', 'midashi', '見出し', '小見出し'],
		run: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
	},
	{
		title: '箇条書きリスト',
		description: '・付きの箇条書き',
		kind: 'block',
		keywords: ['bullet', 'list', 'ul', '箇条書き', 'リスト'],
		run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
	},
	{
		title: '番号付きリスト',
		description: '1. から始まる番号リスト',
		kind: 'block',
		keywords: ['ordered', 'number', 'ol', '番号', 'リスト'],
		run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
	},
	{
		title: '引用',
		description: '引用ブロック',
		kind: 'block',
		keywords: ['quote', 'blockquote', '引用'],
		run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
	},
	{
		title: 'コードブロック',
		description: 'シンタックスハイライト付きコード',
		kind: 'block',
		keywords: ['code', 'codeblock', 'コード'],
		run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
	},
	{
		title: 'チェックリスト',
		description: 'チェックボックス付きタスク',
		kind: 'block',
		keywords: ['task', 'todo', 'check', 'チェック', 'タスク'],
		run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
	},
	{
		title: '区切り線',
		description: '水平の区切り線',
		kind: 'block',
		keywords: ['hr', 'divider', 'rule', 'horizontal', '区切り', '線'],
		run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
	},
];

/**
 * コールアウト・表・トグルの挿入コマンド（Req1.1/3.1/4.1）。
 * 既存9コマンドと同じ構造で range を削除してから挿入する（Req5.4）。
 */
const richBlockDefs: CommandDef[] = [
	{
		title: 'コールアウト',
		description: '💡ポイントや⚠️注意などの枠付きブロック',
		kind: 'block',
		keywords: ['callout', 'コールアウト', '枠', 'ポイント', '注意', 'かこい'],
		run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setCallout().run(),
	},
	{
		title: '表',
		description: 'ヘッダー行付きの表',
		kind: 'block',
		keywords: ['table', '表', 'テーブル', 'ひょう'],
		run: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertTable({ rows: 2, cols: 2, withHeaderRow: true })
				.run(),
	},
	{
		title: 'トグル',
		description: '折りたたみ可能なブロック',
		kind: 'block',
		keywords: ['toggle', 'details', 'トグル', '折りたたみ', 'おりたたみ'],
		// insertOpenDetails（Details.ts）は editor.commands.setDetails() を即時 dispatch する
		// 単体呼び出し専用コマンド（chain 連結不可）のため、range 削除は別の chain 呼び出しで
		// 先に確定させる。連続する dispatch は ProseMirror history の既定グループ化
		// （newGroupDelay）で1回の Undo にまとまる（Req5.5、手元の undo grouping 検証で確認）。
		run: ({ editor, range }) => {
			const deleted = editor.chain().focus().deleteRange(range).run();
			if (deleted) {
				editor.commands.insertOpenDetails();
			}
		},
	},
];

/**
 * テキスト色・マーカーは doc を変更せず palette モードへ遷移するトリガー（notebook 先例と同型）。
 * `run` は no-op。range 削除と mark 適用は Task 7.2 の palette モード確定時に行う（Req5.3/5.4）。
 */
const paletteTriggerDefs: CommandDef[] = [
	{
		title: 'テキスト色',
		description: 'セマンティックカラーで文字色を変える',
		kind: 'palette',
		paletteTarget: 'textColor',
		keywords: ['text color', 'color', 'テキスト色', '文字色', 'もじいろ'],
		run: () => {
			// no-op: 遷移は render/UI 層が担う（doc を汚さない）
		},
	},
	{
		title: 'マーカー',
		description: '蛍光ペン風のハイライト',
		kind: 'palette',
		paletteTarget: 'marker',
		keywords: ['marker', 'highlight', 'マーカー', '蛍光ペン', 'けいこうぺん'],
		run: () => {
			// no-op: 遷移は render/UI 層が担う（doc を汚さない）
		},
	},
];

/**
 * ノートブック参照の遷移トリガー（root モードのみ）。
 * `run` は doc を変更しない。サブメニューへの遷移は render 層が `kind='notebook'` を見て行う（Req3.5）。
 */
const notebookTriggerDef: CommandDef = {
	title: 'ノートブック参照',
	description: '[[ノートブック名]] を挿入',
	kind: 'notebook',
	keywords: ['notebook', 'ノートブック', '参照', 'reference', 'ref', 'link'],
	run: () => {
		// no-op: 遷移は render/UI 層が担う（doc を汚さない）
	},
};

const rootDefs: CommandDef[] = [
	...blockDefs,
	...richBlockDefs,
	...paletteTriggerDefs,
	notebookTriggerDef,
];

/** タイトルまたはキーワードへ前方一致・部分一致するか（大文字小文字無視） */
function matchesQuery(query: string, title: string, keywords: string[]): boolean {
	if (query.length === 0) {
		return true;
	}
	const lc = query.toLowerCase();
	return title.toLowerCase().includes(lc) || keywords.some((k) => k.toLowerCase().includes(lc));
}

function toItem({ title, description, kind, run, paletteTarget }: CommandDef): SlashCommandItem {
	return { title, description, kind, run, paletteTarget };
}

// ─────────────────────────────────────────────────────────────
// ノートブックデータ注入（既存 Mention 流用機構を踏襲・Req9.2）
// ─────────────────────────────────────────────────────────────
let notebooksData: Array<{ id: string; name: string }> = [];

export const setNotebooksData = (notebooks: Array<{ id: string; name: string }>): void => {
	notebooksData = notebooks;
};

export const getNotebooksData = (): Array<{ id: string; name: string }> => notebooksData;

/**
 * クエリと mode から表示すべきコマンド候補を返す純関数。
 *
 * - mode='root': ブロック挿入コマンド ＋ ノートブック参照トリガーをクエリで絞り込む（Req3.2/3.3）。
 * - mode='notebook': 注入済みノートブックをクエリで絞り込み、確定で `[[name]]` を挿入する（Req3.5）。
 *
 * `notebooks` は省略時に注入済みデータを参照するが、テスト容易性のため明示注入も許す。
 */
export function getSlashCommandItems(
	query: string,
	mode: SlashCommandMode = 'root',
	notebooks: Array<{ id: string; name: string }> = notebooksData,
): SlashCommandItem[] {
	if (mode === 'notebook') {
		const lc = query.toLowerCase();
		return notebooks
			.filter((nb) => nb.name.toLowerCase().includes(lc))
			.map((nb) => ({
				title: nb.name,
				description: 'ノートブック',
				kind: 'notebook' as const,
				run: ({ editor, range }: SlashCommandRunParams) => {
					editor.chain().focus().deleteRange(range).insertContent(`[[${nb.name}]]`).run();
				},
			}));
	}

	return rootDefs.filter((def) => matchesQuery(query, def.title, def.keywords)).map(toItem);
}

// ─────────────────────────────────────────────────────────────
// palette モード（テキスト色/マーカーのセマンティックカラースウォッチ・Task 7.2）
// ─────────────────────────────────────────────────────────────

/**
 * palette モードのセマンティックカラースウォッチ候補を返す純関数（notebook モードと同型）。
 *
 * 確定（run）は range を削除したうえで `setTextColor`/`setMarker` を適用する。削除後は選択が
 * 空（カーソルのみ）になるため、`@tiptap/core` の `setMark` は選択範囲へではなく stored mark
 * （以降入力するテキストへ適用される保留マーク）として有効化する（Req5.3・SemanticTextColor/
 * SemanticMarker が内部で使う `setMark` の既定挙動）。
 */
export function getPaletteItems(query: string, target: PaletteTarget): SlashCommandItem[] {
	const swatches = target === 'textColor' ? TEXT_COLOR_SWATCHES : MARKER_SWATCHES;
	const cssVarPrefix = target === 'textColor' ? '--editor-text-' : '--editor-marker-';

	return swatches
		.filter((s) => matchesQuery(query, s.label, [s.name]))
		.map((s) => ({
			title: s.label,
			description: s.name,
			kind: 'palette' as const,
			swatchColorVar: `${cssVarPrefix}${s.name}`,
			run: ({ editor, range }: SlashCommandRunParams) => {
				if (target === 'textColor') {
					editor.chain().focus().deleteRange(range).setTextColor(s.name).run();
				} else {
					editor.chain().focus().deleteRange(range).setMarker(s.name).run();
				}
			},
		}));
}

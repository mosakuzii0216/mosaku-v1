import type { Editor } from '@tiptap/react';

/** スラッシュコマンド実行時にエディタへ渡すコンテキスト */
export interface SlashCommandRunParams {
	editor: Editor;
	/** `/` ＋ クエリ文字列が占める範囲（確定時に削除する） */
	range: { from: number; to: number };
}

/** メニューの表示モード。doc には持たせず render/UI 層が保持する（Req3.5 の最難所） */
export type SlashCommandMode = 'root' | 'notebook';

/**
 * スラッシュコマンド1件の契約。
 *
 * - kind='block': `run` がブロック挿入を実行する。
 * - kind='notebook'（root モード）: ノートブック参照の遷移トリガー。`run` は doc を変更せず、
 *   render 層がサブメニューへ遷移する（Req3.5）。
 * - kind='notebook'（notebook モード）: 個々のノートブック。`run` が `[[name]]` を挿入する。
 */
export interface SlashCommandItem {
	title: string;
	description?: string;
	kind: 'block' | 'notebook';
	run: (params: SlashCommandRunParams) => void;
}

/** クエリ絞り込み用にキーワードを併せ持つコマンド定義 */
interface CommandDef {
	title: string;
	description: string;
	kind: 'block' | 'notebook';
	/** タイトル以外の前方一致・部分一致対象（英語別名・読みなど） */
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

const rootDefs: CommandDef[] = [...blockDefs, notebookTriggerDef];

/** タイトルまたはキーワードへ前方一致・部分一致するか（大文字小文字無視） */
function matchesQuery(query: string, title: string, keywords: string[]): boolean {
	if (query.length === 0) {
		return true;
	}
	const lc = query.toLowerCase();
	return title.toLowerCase().includes(lc) || keywords.some((k) => k.toLowerCase().includes(lc));
}

function toItem({ title, description, kind, run }: CommandDef): SlashCommandItem {
	return { title, description, kind, run };
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

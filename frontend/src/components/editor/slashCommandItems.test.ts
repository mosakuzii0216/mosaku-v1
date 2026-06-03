import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from './createEditorExtensions';
import {
	getSlashCommandItems,
	setNotebooksData,
	getNotebooksData,
	type SlashCommandItem,
} from './slashCommandItems';

const dummySlash = { render: () => ({}) };

/** 空段落のみのエディタを生成し、行頭にキャレットを置く（slash 起動位置を模倣） */
function makeEditor() {
	return new Editor({
		extensions: createEditorExtensions({ editable: true, placeholder: 'x', slash: dummySlash }),
		content: '<p></p>',
	});
}

/** ルートコマンドのタイトル一覧を取得 */
function rootTitles(query = ''): string[] {
	return getSlashCommandItems(query, 'root', []).map((i) => i.title);
}

describe('getSlashCommandItems（コマンド定義とクエリ絞り込み・純関数）', () => {
	beforeEach(() => {
		setNotebooksData([]);
	});

	describe('既定コマンドの網羅（Req3.2）', () => {
		it('root モードで見出しH1〜H3・箇条書き・番号付き・引用・コードブロック・チェックリスト・区切り線・ノートブック参照を提供する', () => {
			const items = getSlashCommandItems('', 'root', []);
			const kinds = new Set(items.map((i) => i.kind));
			expect(kinds.has('block')).toBe(true);
			expect(kinds.has('notebook')).toBe(true);

			// 見出し3レベル分が含まれる
			const headingCount = items.filter((i) => /見出し/.test(i.title)).length;
			expect(headingCount).toBe(3);

			// ブロック系コマンドが揃っている（キーワードで存在確認）
			expect(getSlashCommandItems('箇条書き', 'root', [])).toHaveLength(1);
			expect(getSlashCommandItems('番号', 'root', [])).toHaveLength(1);
			expect(getSlashCommandItems('引用', 'root', [])).toHaveLength(1);
			expect(getSlashCommandItems('コード', 'root', [])).toHaveLength(1);
			expect(getSlashCommandItems('チェック', 'root', [])).toHaveLength(1);
			expect(getSlashCommandItems('区切り', 'root', [])).toHaveLength(1);

			// ノートブック参照コマンドは kind='notebook'（root では遷移トリガー）
			const notebookTrigger = items.find((i) => i.kind === 'notebook');
			expect(notebookTrigger).toBeDefined();
		});
	});

	describe('クエリ絞り込み（Req3.3・前方一致/部分一致）', () => {
		it('クエリ空では全ルートコマンドを返す', () => {
			expect(rootTitles('').length).toBeGreaterThanOrEqual(9);
		});

		it('英語キーワード（h1）で見出しH1のみへ絞り込む', () => {
			const items = getSlashCommandItems('h1', 'root', []);
			expect(items).toHaveLength(1);
			expect(items[0].title).toMatch(/見出し1|H1/);
		});

		it('日本語キーワード（見出し）で見出し系のみへ絞り込む', () => {
			const items = getSlashCommandItems('見出し', 'root', []);
			expect(items.length).toBe(3);
			expect(items.every((i) => i.kind === 'block')).toBe(true);
		});

		it('大文字小文字を区別しない（CODE でもコードブロックにヒット）', () => {
			expect(getSlashCommandItems('CODE', 'root', [])).toHaveLength(1);
		});

		it('該当なしクエリでは空配列を返す（Req3.8）', () => {
			expect(getSlashCommandItems('zzzznomatch', 'root', [])).toEqual([]);
		});
	});

	describe('ブロック挿入の run（既存ツールバーと同一ノード構造・Req2.10/3.4）', () => {
		it('見出しコマンドは range を削除して H1 見出しへ変換する', () => {
			const editor = makeEditor();
			const item = getSlashCommandItems('h1', 'root', [])[0];
			item.run({ editor, range: { from: 1, to: 1 } });
			expect(editor.isActive('heading', { level: 1 })).toBe(true);
			editor.destroy();
		});

		it('チェックリストコマンドは taskList ノードを生成する', () => {
			const editor = makeEditor();
			const item = getSlashCommandItems('チェック', 'root', [])[0];
			item.run({ editor, range: { from: 1, to: 1 } });
			expect(editor.isActive('taskList')).toBe(true);
			editor.destroy();
		});

		it('区切り線コマンドは horizontalRule を挿入する', () => {
			const editor = makeEditor();
			const item = getSlashCommandItems('区切り', 'root', [])[0];
			item.run({ editor, range: { from: 1, to: 1 } });
			expect(editor.getHTML()).toContain('<hr');
			editor.destroy();
		});

		it('コードブロックコマンドは codeBlock ノードを生成する', () => {
			const editor = makeEditor();
			const item = getSlashCommandItems('コード', 'root', [])[0];
			item.run({ editor, range: { from: 1, to: 1 } });
			expect(editor.isActive('codeBlock')).toBe(true);
			editor.destroy();
		});

		it('root のノートブック参照コマンドの run は doc を変更しない（遷移は render 層が担う・Req3.5）', () => {
			const editor = makeEditor();
			const before = editor.getHTML();
			const trigger = getSlashCommandItems('', 'root', []).find((i) => i.kind === 'notebook')!;
			trigger.run({ editor, range: { from: 1, to: 1 } });
			expect(editor.getHTML()).toBe(before);
			editor.destroy();
		});
	});

	describe('ノートブックサブメニュー（mode=notebook・Req3.5）', () => {
		it('注入済みノートブックをクエリで絞り込む', () => {
			const notebooks = [
				{ id: '1', name: '日記' },
				{ id: '2', name: '技術メモ' },
				{ id: '3', name: 'Recipe' },
			];
			expect(getSlashCommandItems('', 'notebook', notebooks)).toHaveLength(3);
			expect(getSlashCommandItems('技術', 'notebook', notebooks)).toHaveLength(1);
			expect(getSlashCommandItems('rec', 'notebook', notebooks)).toHaveLength(1); // 大文字小文字無視
			expect(getSlashCommandItems('該当なし', 'notebook', notebooks)).toEqual([]);
		});

		it('ノートブック候補の run は range 削除後に [[name]] をプレーンテキスト挿入する（Req3.5/9.2）', () => {
			const editor = makeEditor();
			const items = getSlashCommandItems('', 'notebook', [{ id: '1', name: '技術メモ' }]);
			expect(items[0].kind).toBe('notebook');
			items[0].run({ editor, range: { from: 1, to: 1 } });
			expect(editor.getText()).toContain('[[技術メモ]]');
			editor.destroy();
		});

		it('notebooks 引数省略時は注入済みデータ（setNotebooksData）を参照する', () => {
			setNotebooksData([{ id: '1', name: '注入ノート' }]);
			expect(getNotebooksData()).toHaveLength(1);
			const items = getSlashCommandItems('注入', 'notebook');
			expect(items).toHaveLength(1);
			expect(items[0].title).toBe('注入ノート');
		});
	});

	describe('SlashCommandItem 契約', () => {
		it('すべての項目が title/kind/run を持つ', () => {
			const items: SlashCommandItem[] = getSlashCommandItems('', 'root', []);
			for (const item of items) {
				expect(typeof item.title).toBe('string');
				expect(['block', 'notebook']).toContain(item.kind);
				expect(typeof item.run).toBe('function');
			}
		});
	});
});

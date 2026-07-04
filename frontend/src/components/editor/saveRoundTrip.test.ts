import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/react';
import { createEditorExtensions } from './createEditorExtensions';
import { isJsonContentEqual } from './contentSync';

/**
 * 保存 JSON 往復の結合テスト（content-jsonb-migration Task 6.3）
 *
 * 編集（RichTextEditor 相当・editable:true）で `getJSON()` して得た JSON が「保存される値」であり、
 * それを再読込（編集の再オープン）および公開表示（PublicMemoRenderer 相当・editable:false）へ
 * 流したとき、タスクリスト / コードブロック言語 / 区切り線 / リンク / 見出し / 装飾 / 引用の
 * ノード構造が崩れずに往復することを、共有ファクトリ createEditorExtensions 経由で担保する。
 *
 * Requirements 対応: 3.6, 5.2, 5.5, 8.5
 */

const dummySlash = { render: () => ({}) };

function getJson(editable: boolean, content: JSONContent): JSONContent {
	const editor = new Editor({
		extensions: createEditorExtensions(
			editable ? { editable: true, placeholder: 'x', slash: dummySlash } : { editable: false },
		),
		content,
	});
	const json = editor.getJSON() as JSONContent;
	editor.destroy();
	return json;
}

const COMPLEX_DOC: JSONContent = {
	type: 'doc',
	content: [
		{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'タイトル' }] },
		{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '節' }] },
		{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '項' }] },
		{
			type: 'paragraph',
			content: [
				{ type: 'text', text: '本文に' },
				{ type: 'text', marks: [{ type: 'bold' }], text: '太字' },
				{ type: 'text', text: 'と' },
				{ type: 'text', marks: [{ type: 'italic' }], text: '斜体' },
				{ type: 'text', text: 'と' },
				{ type: 'text', marks: [{ type: 'strike' }], text: '取消線' },
				{ type: 'text', text: '。' },
			],
		},
		{
			type: 'bulletList',
			content: [
				{
					type: 'listItem',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: '箇条書き' }] }],
				},
			],
		},
		{
			type: 'orderedList',
			content: [
				{
					type: 'listItem',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: '番号付き' }] }],
				},
			],
		},
		{
			type: 'blockquote',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: '引用' }] }],
		},
		{ type: 'horizontalRule' },
		{
			type: 'taskList',
			content: [
				{
					type: 'taskItem',
					attrs: { checked: true },
					content: [{ type: 'paragraph', content: [{ type: 'text', text: '完了' }] }],
				},
			],
		},
		{
			type: 'codeBlock',
			attrs: { language: 'typescript' },
			content: [{ type: 'text', text: 'const x = 1;' }],
		},
		{
			type: 'paragraph',
			content: [
				{
					type: 'text',
					marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank' } }],
					text: 'link',
				},
			],
		},
		{ type: 'paragraph', content: [{ type: 'text', text: '[[マイノートブック]] への参照' }] },
	],
};

describe('保存 JSON 往復（結合）', () => {
	describe('getJSON ラウンドトリップ（Req3.6）', () => {
		it('編集側で setContent した JSON を getJSON しても構造が一致する', () => {
			const saved = getJson(true, COMPLEX_DOC);
			const reloaded = getJson(true, saved);
			expect(isJsonContentEqual(saved, reloaded)).toBe(true);
		});

		it('編集→公開でも JSON 構造が一致する（Req5.2）', () => {
			const saved = getJson(true, COMPLEX_DOC);
			const published = getJson(false, saved);
			expect(isJsonContentEqual(saved, published)).toBe(true);
		});

		it('空 doc の往復一致', () => {
			const emptyDoc: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };
			const saved = getJson(true, emptyDoc);
			const reloaded = getJson(true, saved);
			expect(isJsonContentEqual(saved, reloaded)).toBe(true);
		});
	});

	describe('タスクリストの checked が往復で保持される（Req5.4）', () => {
		const taskDoc: JSONContent = {
			type: 'doc',
			content: [
				{
					type: 'taskList',
					content: [
						{
							type: 'taskItem',
							attrs: { checked: true },
							content: [{ type: 'paragraph', content: [{ type: 'text', text: '完了タスク' }] }],
						},
						{
							type: 'taskItem',
							attrs: { checked: false },
							content: [{ type: 'paragraph', content: [{ type: 'text', text: '未完了タスク' }] }],
						},
					],
				},
			],
		};

		it('編集で保存 → 編集で再読込しても checked が保持される', () => {
			const saved = getJson(true, taskDoc);
			const reloaded = getJson(true, saved);
			expect(isJsonContentEqual(saved, reloaded)).toBe(true);
			const taskItems = saved.content?.[0]?.content ?? [];
			expect(taskItems[0]?.attrs?.checked).toBe(true);
			expect(taskItems[1]?.attrs?.checked).toBe(false);
		});

		it('編集で保存 → 公開表示でも checked が保持される', () => {
			const saved = getJson(true, taskDoc);
			const published = getJson(false, saved);
			expect(isJsonContentEqual(saved, published)).toBe(true);
		});
	});

	describe('コードブロックの言語属性が往復で保持される（Req4.5）', () => {
		const codeDoc: JSONContent = {
			type: 'doc',
			content: [
				{
					type: 'codeBlock',
					attrs: { language: 'typescript' },
					content: [{ type: 'text', text: 'const greet = (n: string) => `hi ${n}`;' }],
				},
			],
		};

		it('編集で保存 → 編集で再読込しても言語属性が保持される', () => {
			const saved = getJson(true, codeDoc);
			const reloaded = getJson(true, saved);
			expect(isJsonContentEqual(saved, reloaded)).toBe(true);
			expect(saved.content?.[0]?.attrs?.language).toBe('typescript');
		});

		it('編集で保存 → 公開表示でも言語属性が保持される', () => {
			const saved = getJson(true, codeDoc);
			const published = getJson(false, saved);
			expect(isJsonContentEqual(saved, published)).toBe(true);
			expect(published.content?.[0]?.attrs?.language).toBe('typescript');
		});
	});

	describe('見出し・リスト・装飾・区切り線・リンクを含む複合ドキュメント（Req8.5）', () => {
		it('編集→公開で構造的等価（Req5.2）', () => {
			const saved = getJson(true, COMPLEX_DOC);
			const published = getJson(false, saved);
			expect(isJsonContentEqual(saved, published)).toBe(true);
		});

		it('編集→再読込でも同一 JSON に復元される（保存ループの土台が往復で安定）', () => {
			const saved = getJson(true, COMPLEX_DOC);
			const reloaded = getJson(true, saved);
			expect(isJsonContentEqual(saved, reloaded)).toBe(true);
		});

		it('ノートブック参照 [[name]] はプレーンテキストとして往復で保持される（Req9.2 非回帰）', () => {
			const saved = getJson(true, COMPLEX_DOC);
			const published = getJson(false, saved);
			// paragraph ノードの text に [[マイノートブック]] が含まれる
			const hasRef = (doc: JSONContent): boolean =>
				(doc.content ?? []).some(
					(n) =>
						n.type === 'paragraph' &&
						(n.content ?? []).some(
							(c) => c.type === 'text' && (c.text ?? '').includes('[[マイノートブック]]'),
						),
				);
			expect(hasRef(saved)).toBe(true);
			expect(hasRef(published)).toBe(true);
		});

		it('リンクは保存・公開で href 構造を保持する（Req5.5）', () => {
			const saved = getJson(true, COMPLEX_DOC);
			const published = getJson(false, saved);
			const findLink = (doc: JSONContent): string | undefined => {
				for (const node of doc.content ?? []) {
					for (const inline of node.content ?? []) {
						for (const mark of inline.marks ?? []) {
							if (mark.type === 'link') return (mark.attrs?.href as string) ?? undefined;
						}
					}
				}
				return undefined;
			};
			expect(findLink(saved)).toBe('https://example.com');
			expect(findLink(published)).toBe('https://example.com');
		});

		it('区切り線 horizontalRule が保存・公開で保持される（Req6）', () => {
			const saved = getJson(true, COMPLEX_DOC);
			const published = getJson(false, saved);
			const hasHr = (doc: JSONContent) =>
				(doc.content ?? []).some((n) => n.type === 'horizontalRule');
			expect(hasHr(saved)).toBe(true);
			expect(hasHr(published)).toBe(true);
		});
	});
});

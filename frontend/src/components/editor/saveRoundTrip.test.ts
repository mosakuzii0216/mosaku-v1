import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from './createEditorExtensions';

/**
 * 保存 HTML 往復の結合テスト（markdown-wysiwyg-editor タスク 5.1）
 *
 * 編集（RichTextEditor 相当・editable:true）で生成した HTML が「保存される値」であり、
 * それを再読込（編集の再オープン）および公開表示（PublicMemoRenderer 相当・editable:false）へ
 * 流したとき、新規ノード（タスクリストの data-checked / コードブロックの言語 class /
 * 区切り線 / リンク）と、見出し・リスト・装飾・ノートブック参照 `[[name]]` のノード構造が
 * 崩れずに往復することを、共有ファクトリ createEditorExtensions 経由で構造的に担保する。
 *
 * Requirements 対応: 4.5, 5.4, 8.3, 9.4
 */

const dummySlash = { render: () => ({}) };

/** 与えた content を指定モードのエディタへ流し、保存される HTML（getHTML）を返す */
function renderHtml(editable: boolean, content: string): string {
	const editor = new Editor({
		extensions: createEditorExtensions(
			editable ? { editable: true, placeholder: 'x', slash: dummySlash } : { editable: false },
		),
		content,
	});
	const html = editor.getHTML();
	editor.destroy();
	return html;
}

describe('保存 HTML 往復（結合）', () => {
	describe('タスクリストの data-checked が再読込・公開で保持される（Req5.4）', () => {
		const html = [
			'<ul data-type="taskList">',
			'<li data-type="taskItem" data-checked="true">完了タスク</li>',
			'<li data-type="taskItem" data-checked="false">未完了タスク</li>',
			'</ul>',
		].join('');

		it('編集で保存 → 編集で再読込しても data-checked が保持される', () => {
			const saved = renderHtml(true, html);
			const reloaded = renderHtml(true, saved);

			expect(saved).toContain('data-checked="true"');
			expect(saved).toContain('data-checked="false"');
			// 再読込（メモ再オープン）でチェック状態が往復する
			expect(reloaded).toEqual(saved);
		});

		it('編集で保存 → 公開表示でも data-checked が保持される', () => {
			const saved = renderHtml(true, html);
			const published = renderHtml(false, saved);

			expect(published).toContain('data-checked="true"');
			expect(published).toContain('data-checked="false"');
			expect(published).toEqual(saved);
		});
	});

	describe('コードブロックの言語 class が再読込・公開で保持される（Req4.5）', () => {
		const html =
			'<pre><code class="language-typescript">const greet = (n: string) =&gt; `hi ${n}`;</code></pre>';

		it('編集で保存 → 編集で再読込しても言語 class が保持される', () => {
			const saved = renderHtml(true, html);
			const reloaded = renderHtml(true, saved);

			expect(saved).toContain('language-typescript');
			expect(reloaded).toContain('language-typescript');
			expect(reloaded).toEqual(saved);
		});

		it('編集で保存 → 公開表示でも言語 class が保持される', () => {
			const saved = renderHtml(true, html);
			const published = renderHtml(false, saved);

			expect(published).toContain('language-typescript');
			expect(published).toEqual(saved);
		});
	});

	describe('見出し・リスト・装飾・区切り線・リンク・ノートブック参照を含む複合ドキュメント（Req8.3/9.4）', () => {
		const html = [
			'<h1>タイトル</h1>',
			'<h2>節</h2>',
			'<h3>項</h3>',
			'<p>本文に<strong>太字</strong>と<em>斜体</em>と<s>取消線</s>。</p>',
			'<ul><li>箇条書き</li></ul>',
			'<ol><li>番号付き</li></ol>',
			'<blockquote><p>引用</p></blockquote>',
			'<hr>',
			'<ul data-type="taskList"><li data-type="taskItem" data-checked="true">完了</li></ul>',
			'<pre><code class="language-json">{"a":1}</code></pre>',
			'<p><a href="https://example.com">link</a></p>',
			'<p>[[マイノートブック]] への参照</p>',
		].join('');

		it('編集→保存→公開でノード構造が完全一致する', () => {
			// 編集側で一度正規化した HTML が「保存される値」。それを公開側へ流し往復一致を確認。
			const saved = renderHtml(true, html);
			const published = renderHtml(false, saved);

			expect(saved).toEqual(published);
			expect(saved).toMatchSnapshot();
		});

		it('編集→保存→編集再読込でも同一 HTML へ復元される（保存ループの土台が往復で安定）', () => {
			const saved = renderHtml(true, html);
			const reloaded = renderHtml(true, saved);

			expect(reloaded).toEqual(saved);
		});

		it('ノートブック参照 [[name]] はプレーンテキストとして往復で保持される（Req9.2 非回帰）', () => {
			const saved = renderHtml(true, html);
			const published = renderHtml(false, saved);

			// 自動リンク化されず、リンクノードにもならないプレーンテキストのまま
			expect(saved).toContain('[[マイノートブック]]');
			expect(published).toContain('[[マイノートブック]]');
			expect(saved).not.toContain('<a href="[[');
		});

		it('リンクは保存・公開で rel 属性（タブナビング対策）を保持する（Req7）', () => {
			const saved = renderHtml(true, html);
			const published = renderHtml(false, saved);

			expect(saved).toContain('rel="noopener noreferrer nofollow"');
			expect(published).toContain('rel="noopener noreferrer nofollow"');
		});

		it('区切り線 <hr> が保存・公開で保持される（Req6）', () => {
			const saved = renderHtml(true, html);
			const published = renderHtml(false, saved);

			expect(saved).toContain('<hr>');
			expect(published).toContain('<hr>');
		});
	});
});

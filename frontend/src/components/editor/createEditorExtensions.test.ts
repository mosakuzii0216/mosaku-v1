import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from './createEditorExtensions';

/** 与えた options でエディタを構築し、フラット化された拡張名一覧を返す */
function extensionNames(options: Parameters<typeof createEditorExtensions>[0]): string[] {
	const editor = new Editor({ extensions: createEditorExtensions(options) });
	const names = editor.extensionManager.extensions.map((e) => e.name);
	editor.destroy();
	return names;
}

/**
 * Placeholder / SlashCommand / TrailingNode を除いた「ノード定義集合」を返す（往復一致の検証用）。
 * 3つとも editable による意図的な出し分け対象の UX 専用拡張（ノード/マークではなく HTML 往復に
 * 現れない）であり、公開ビューでは TrailingNode を無効化する（Task 1.2: Req6.4 対応）。
 */
function nodeDefinitionNames(options: Parameters<typeof createEditorExtensions>[0]): string[] {
	return extensionNames(options)
		.filter((name) => name !== 'placeholder' && name !== 'slashCommand' && name !== 'trailingNode')
		.sort();
}

const dummySlash = { render: () => ({}) };

describe('createEditorExtensions', () => {
	describe('editable による出し分け', () => {
		it('editable=true では Placeholder と SlashCommand を含む', () => {
			const names = extensionNames({ editable: true, placeholder: 'メモ', slash: dummySlash });
			expect(names).toContain('placeholder');
			expect(names).toContain('slashCommand');
		});

		it('editable=false（公開表示）では Placeholder と SlashCommand を含まない', () => {
			const names = extensionNames({ editable: false });
			expect(names).not.toContain('placeholder');
			expect(names).not.toContain('slashCommand');
		});

		it('編集・公開ともに新規ノード定義（codeBlock/taskList/taskItem/link/horizontalRule）を含む', () => {
			for (const editable of [true, false]) {
				const names = extensionNames({ editable, placeholder: 'x', slash: dummySlash });
				// CodeBlockLowlight はノード名 'codeBlock' のドロップイン置換（往復一致のため名前を保つ）
				expect(names).toContain('codeBlock');
				expect(names).toContain('taskList');
				expect(names).toContain('taskItem');
				expect(names).toContain('link');
				expect(names).toContain('horizontalRule');
			}
		});

		it('編集・公開ともにトグル（details/detailsSummary/detailsContent）を editable 非依存で含む（Task 1.2 spike の仮登録）', () => {
			for (const editable of [true, false]) {
				const names = extensionNames({ editable, placeholder: 'x', slash: dummySlash });
				expect(names).toContain('details');
				expect(names).toContain('detailsSummary');
				expect(names).toContain('detailsContent');
			}
		});

		it('編集・公開ともにテキスト色・マーカー（textStyle/highlight）を editable 非依存で含む（Task 3.1/3.2）', () => {
			for (const editable of [true, false]) {
				const names = extensionNames({ editable, placeholder: 'x', slash: dummySlash });
				expect(names).toContain('textStyle');
				expect(names).toContain('highlight');
			}
		});

		it('編集・公開ともにコールアウト（callout）を editable 非依存で含む（Task 4.1）', () => {
			for (const editable of [true, false]) {
				const names = extensionNames({ editable, placeholder: 'x', slash: dummySlash });
				expect(names).toContain('callout');
			}
		});

		it('編集・公開ともに表（table/tableRow/tableHeader/tableCell）を editable 非依存で含む（Task 5）', () => {
			for (const editable of [true, false]) {
				const names = extensionNames({ editable, placeholder: 'x', slash: dummySlash });
				expect(names).toContain('table');
				expect(names).toContain('tableRow');
				expect(names).toContain('tableHeader');
				expect(names).toContain('tableCell');
			}
		});

		it('table は resizable:false・renderWrapper:true で登録されている（Req3.6 の横スクロール前提）', () => {
			const editor = new Editor({
				extensions: createEditorExtensions({ editable: true, placeholder: 'x' }),
			});
			const table = editor.extensionManager.extensions.find((e) => e.name === 'table');
			editor.destroy();
			expect(table?.options.resizable).toBe(false);
			expect(table?.options.renderWrapper).toBe(true);
		});

		it('公式 Color/BackgroundColor サブ拡張は登録しない（Req2.5: hex 非保存を構造的に担保）', () => {
			const names = extensionNames({ editable: true, placeholder: 'x', slash: dummySlash });
			expect(names).not.toContain('color');
			expect(names).not.toContain('backgroundColor');
		});

		it('Details は persist:false（既定）で登録されている（公開ビュー開閉の前提）', () => {
			const editor = new Editor({
				extensions: createEditorExtensions({ editable: true, placeholder: 'x' }),
			});
			const details = editor.extensionManager.extensions.find((e) => e.name === 'details');
			editor.destroy();
			expect(details?.options.persist).toBe(false);
		});

		it('codeBlock は Lowlight 版（lowlight インスタンス保持）へ差し替わっている', () => {
			const editor = new Editor({
				extensions: createEditorExtensions({ editable: true, placeholder: 'x', slash: dummySlash }),
			});
			const codeBlocks = editor.extensionManager.extensions.filter((e) => e.name === 'codeBlock');
			const options = codeBlocks[0]?.options;
			editor.destroy();
			// StarterKit 標準の codeBlock は無効化され、Lowlight 版が1つだけ登録される
			expect(codeBlocks).toHaveLength(1);
			expect(options?.lowlight).toBeDefined();
		});

		it('見出しは H1〜H3 に限定される', () => {
			const editor = new Editor({
				extensions: createEditorExtensions({ editable: true, placeholder: 'x' }),
			});
			const heading = editor.extensionManager.extensions.find((e) => e.name === 'heading');
			editor.destroy();
			expect(heading?.options.levels).toEqual([1, 2, 3]);
		});

		it('TaskItem は onReadOnlyChecked 未設定（公開時クリックでトグルしない＝読取専用）', () => {
			// editor.editable=false のとき、onReadOnlyChecked が無ければチェックボックスは反転を戻す
			const editor = new Editor({
				extensions: createEditorExtensions({ editable: false }),
			});
			const taskItem = editor.extensionManager.extensions.find((e) => e.name === 'taskItem');
			editor.destroy();
			expect(taskItem?.options.onReadOnlyChecked).toBeUndefined();
		});
	});

	describe('ノード定義集合の一致（保存 HTML 往復の担保）', () => {
		it('editable に依らずノード定義集合が一致する', () => {
			const editableSet = nodeDefinitionNames({
				editable: true,
				placeholder: 'x',
				slash: dummySlash,
			});
			const publicSet = nodeDefinitionNames({ editable: false });
			expect(editableSet).toEqual(publicSet);
		});

		it('タスクリストの data-checked が編集・公開の同一拡張で往復保持される', () => {
			const html =
				'<ul data-type="taskList"><li data-type="taskItem" data-checked="true">完了タスク</li></ul>';

			const editorEdit = new Editor({
				extensions: createEditorExtensions({ editable: true, placeholder: 'x', slash: dummySlash }),
				content: html,
			});
			const editHtml = editorEdit.getHTML();
			editorEdit.destroy();

			const editorPublic = new Editor({
				extensions: createEditorExtensions({ editable: false }),
				content: editHtml,
			});
			const publicHtml = editorPublic.getHTML();
			editorPublic.destroy();

			expect(editHtml).toContain('data-checked="true"');
			expect(publicHtml).toContain('data-checked="true"');
		});

		it('コードブロックの言語 class が編集・公開の同一拡張で往復保持される', () => {
			const html = '<pre><code class="language-typescript">const x = 1;</code></pre>';

			const editorEdit = new Editor({
				extensions: createEditorExtensions({ editable: true, placeholder: 'x', slash: dummySlash }),
				content: html,
			});
			const editHtml = editorEdit.getHTML();
			editorEdit.destroy();

			const editorPublic = new Editor({
				extensions: createEditorExtensions({ editable: false }),
				content: editHtml,
			});
			const publicHtml = editorPublic.getHTML();
			editorPublic.destroy();

			expect(editHtml).toContain('language-typescript');
			expect(publicHtml).toContain('language-typescript');
		});

		it('見出し・リスト・装飾・区切り線・リンク・タスク・コードを含む複合ドキュメントが編集→公開で同一ノードへ復元される', () => {
			const html = [
				'<h1>タイトル</h1>',
				'<p>本文に<strong>太字</strong>と<em>斜体</em>と<s>取消線</s>。</p>',
				'<ul><li>箇条書き</li></ul>',
				'<ol><li>番号付き</li></ol>',
				'<blockquote><p>引用</p></blockquote>',
				'<hr>',
				'<ul data-type="taskList"><li data-type="taskItem" data-checked="true">完了</li></ul>',
				'<pre><code class="language-json">{"a":1}</code></pre>',
				'<p><a href="https://example.com">link</a></p>',
			].join('');

			const renderHtml = (editable: boolean, content: string) => {
				const editor = new Editor({
					extensions: createEditorExtensions(
						editable
							? { editable: true, placeholder: 'x', slash: dummySlash }
							: { editable: false },
					),
					content,
				});
				const out = editor.getHTML();
				editor.destroy();
				return out;
			};

			// 編集側で一度正規化した HTML を公開側へ流し、ノード構造が一致することをスナップショットで担保
			const editHtml = renderHtml(true, html);
			const publicHtml = renderHtml(false, editHtml);

			expect(editHtml).toEqual(publicHtml);
			expect(editHtml).toMatchSnapshot();
		});
	});

	describe('リンクのセキュリティ設定', () => {
		it('Link は rel と protocols を設定し openOnClick を editable で出し分ける', () => {
			const findLink = (editable: boolean) => {
				const editor = new Editor({
					extensions: createEditorExtensions({ editable, placeholder: 'x' }),
				});
				const link = editor.extensionManager.extensions.find((e) => e.name === 'link');
				const options = link?.options;
				editor.destroy();
				return options;
			};

			const editOptions = findLink(true);
			const publicOptions = findLink(false);

			expect(editOptions?.HTMLAttributes?.rel).toBe('noopener noreferrer nofollow');
			expect(editOptions?.protocols).toEqual(['http', 'https', 'mailto']);
			expect(editOptions?.openOnClick).toBe(false); // 編集中はクリック遷移しない
			expect(publicOptions?.openOnClick).toBe(true); // 公開表示はクリックで遷移
		});
	});
});

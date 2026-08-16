import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from './createEditorExtensions';

/**
 * rich-editor-blocks Task 1.2: トグル（Details, persist:false）の開閉が
 * 公開ビュー相当（editable:false）で view-state のみで成立し、doc トランザクションを
 * 発行しないことを実 Editor で固定する（research.md R2 の spike 確定）。
 * 併せて、公開ビューで許可しない編集操作（本文編集・TaskItem チェックボックス）が
 * editable:false 下で拒否されることを固定する。
 */
describe('rich-editor-blocks: トグル公開ビュー開閉の spike（Task 1.2）', () => {
	const detailsDoc = {
		type: 'doc',
		content: [
			{
				type: 'details',
				content: [
					{ type: 'detailsSummary', content: [{ type: 'text', text: 'サマリー' }] },
					{
						type: 'detailsContent',
						content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文' }] }],
					},
				],
			},
		],
	};

	it('editable:false でもサマリーのトグルボタンをクリックすると開閉する（view-state）', () => {
		const editor = new Editor({
			extensions: createEditorExtensions({ editable: false }),
			content: detailsDoc,
			editable: false,
		});

		const wrapper = editor.view.dom.querySelector('div[data-type="details"]') as HTMLElement;
		const toggleButton = wrapper.querySelector('button') as HTMLButtonElement;
		const contentDom = wrapper.querySelector('div[data-type="detailsContent"]') as HTMLElement;

		// persist:false では open 属性がスキーマに存在しないため、初期状態は常に「閉」
		expect(wrapper.classList.contains('is-open')).toBe(false);
		expect(contentDom.hasAttribute('hidden')).toBe(true);

		toggleButton.click();

		expect(wrapper.classList.contains('is-open')).toBe(true);
		expect(contentDom.hasAttribute('hidden')).toBe(false);

		toggleButton.click();

		expect(wrapper.classList.contains('is-open')).toBe(false);
		expect(contentDom.hasAttribute('hidden')).toBe(true);

		editor.destroy();
	});

	it('editable:false でのトグル開閉は doc トランザクションを発行しない（persist:false）', () => {
		const editor = new Editor({
			extensions: createEditorExtensions({ editable: false }),
			content: detailsDoc,
			editable: false,
		});

		const beforeJson = editor.getJSON();
		const toggleButton = editor.view.dom.querySelector(
			'div[data-type="details"] button',
		) as HTMLButtonElement;

		toggleButton.click();

		expect(editor.getJSON()).toEqual(beforeJson);

		editor.destroy();
	});

	it('editable:false では TaskItem のチェックボックス操作が拒否され doc が変化しない', () => {
		const taskDoc = {
			type: 'doc',
			content: [
				{
					type: 'taskList',
					content: [
						{
							type: 'taskItem',
							attrs: { checked: false },
							content: [{ type: 'paragraph', content: [{ type: 'text', text: '未完了タスク' }] }],
						},
					],
				},
			],
		};

		const editor = new Editor({
			extensions: createEditorExtensions({ editable: false }),
			content: taskDoc,
			editable: false,
		});

		const checkbox = editor.view.dom.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(checkbox.checked).toBe(false);

		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change', { bubbles: true }));

		// onReadOnlyChecked 未設定のため editor.isEditable=false 時は視覚状態が元へ戻る
		expect(checkbox.checked).toBe(false);
		expect(editor.getJSON().content?.[0]?.content?.[0]?.attrs?.checked).toBe(false);

		editor.destroy();
	});
});

import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from './createEditorExtensions';

function makeEditor(content?: string) {
	return new Editor({
		extensions: createEditorExtensions({ editable: true, placeholder: 'x' }),
		content,
	});
}

/**
 * rich-editor-blocks Task 6: トグル（Details）の挿入とサマリー/本文の編集。
 * Task 1.2 spike で確定した persist:false 方式の単一情報源登録を前提に、
 * 挿入コマンド（開いた状態で挿入・Req4.1）とサマリー/本文の編集許可（Req4.4）、
 * 編集面での開閉 view-state（Req4.2/4.3）を固定する。
 */
describe('Details node（トグル・Task 6）', () => {
	it('insertOpenDetails でカーソル位置に開いた状態のトグルを挿入する（Req4.1）', () => {
		const editor = makeEditor('<p></p>');

		const result = editor.commands.insertOpenDetails();
		expect(result).toBe(true);

		const json = editor.getJSON();
		const details = json.content?.find((n) => n.type === 'details');
		expect(details).toBeDefined();
		expect(details?.content?.[0]?.type).toBe('detailsSummary');
		expect(details?.content?.[1]?.type).toBe('detailsContent');

		const wrapper = editor.view.dom.querySelector('div[data-type="details"]') as HTMLElement;
		const contentDom = wrapper.querySelector('div[data-type="detailsContent"]') as HTMLElement;
		expect(wrapper.classList.contains('is-open')).toBe(true);
		expect(contentDom.hasAttribute('hidden')).toBe(false);

		editor.destroy();
	});

	it('サマリー行（inline）へテキストを入力できる（Req4.4）', () => {
		const editor = makeEditor();
		editor.commands.insertOpenDetails();

		// insertOpenDetails 実行後、キャレットはサマリー内にある（setDetails の既定挙動）
		editor.commands.insertContent('見出し');

		const json = editor.getJSON();
		const summary = json.content?.find((n) => n.type === 'details')?.content?.[0];
		expect(summary?.type).toBe('detailsSummary');
		expect(summary?.content?.[0]?.text).toBe('見出し');

		editor.destroy();
	});

	it('本文領域（block+）へ段落・リストなど複数ブロックを配置できる（Req4.4）', () => {
		const doc = {
			type: 'doc',
			content: [
				{
					type: 'details',
					content: [
						{ type: 'detailsSummary', content: [{ type: 'text', text: 'サマリー' }] },
						{
							type: 'detailsContent',
							content: [
								{ type: 'paragraph', content: [{ type: 'text', text: '段落1' }] },
								{
									type: 'bulletList',
									content: [
										{
											type: 'listItem',
											content: [{ type: 'paragraph', content: [{ type: 'text', text: '項目1' }] }],
										},
									],
								},
							],
						},
					],
				},
			],
		};

		const editor = new Editor({
			extensions: createEditorExtensions({ editable: true, placeholder: 'x' }),
			content: doc,
		});

		expect(editor.getJSON()).toEqual(doc);

		editor.destroy();
	});

	it('編集面でも開閉トグルは view-state のみで doc を変更しない（Req4.2/4.3）', () => {
		const editor = makeEditor();
		editor.commands.insertOpenDetails();
		const beforeJson = editor.getJSON();

		const wrapper = editor.view.dom.querySelector('div[data-type="details"]') as HTMLElement;
		const toggleButton = wrapper.querySelector('button') as HTMLButtonElement;
		const contentDom = wrapper.querySelector('div[data-type="detailsContent"]') as HTMLElement;

		expect(wrapper.classList.contains('is-open')).toBe(true);

		toggleButton.click();
		expect(wrapper.classList.contains('is-open')).toBe(false);
		expect(contentDom.hasAttribute('hidden')).toBe(true);
		expect(editor.getJSON()).toEqual(beforeJson);

		toggleButton.click();
		expect(wrapper.classList.contains('is-open')).toBe(true);
		expect(contentDom.hasAttribute('hidden')).toBe(false);
		expect(editor.getJSON()).toEqual(beforeJson);

		editor.destroy();
	});

	it('カーソル位置に有効な範囲がない場合（can() 判定）は副作用なく false を返す', () => {
		const editor = makeEditor('<p></p>');
		const can = editor.can().insertOpenDetails();
		expect(can).toBe(true);
		// can() 判定では doc が変化していないこと
		expect(editor.getJSON().content).toHaveLength(1);
		expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
		editor.destroy();
	});
});

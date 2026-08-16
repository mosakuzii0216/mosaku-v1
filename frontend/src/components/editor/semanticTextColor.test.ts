import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from './createEditorExtensions';

/** 段落テキストを選択した状態のエディタを生成する（Req2.1/2.4 の選択範囲コマンド検証用） */
function makeEditorWithSelectedText() {
	const editor = new Editor({
		extensions: createEditorExtensions({ editable: true, placeholder: 'x' }),
		content: '<p>だいじな言葉</p>',
	});
	editor.commands.selectAll();
	return editor;
}

describe('SemanticTextColor（TextStyle 拡張・Task 3.1）', () => {
	it('setTextColor で選択範囲へセマンティック名のみが JSON に残り hex が混入しない', () => {
		const editor = makeEditorWithSelectedText();

		editor.commands.setTextColor('wakaba');
		const json = editor.getJSON();
		const textNode = json.content?.[0]?.content?.[0];

		expect(textNode?.marks).toEqual([{ type: 'textStyle', attrs: { textColor: 'wakaba' } }]);
		expect(JSON.stringify(json)).not.toMatch(/#[0-9a-fA-F]{3,6}/);
		expect(JSON.stringify(json)).not.toContain('style');

		editor.destroy();
	});

	it('unsetTextColor で除去すると既定（マークなし）へ戻る', () => {
		const editor = makeEditorWithSelectedText();

		editor.commands.setTextColor('wakaba');
		editor.commands.unsetTextColor();
		const json = editor.getJSON();
		const textNode = json.content?.[0]?.content?.[0];

		expect(textNode?.marks ?? []).toEqual([]);

		editor.destroy();
	});

	it('HTML 出力は data-text-color 属性のみで生の style="color:…" を出力しない', () => {
		const editor = makeEditorWithSelectedText();

		editor.commands.setTextColor('sora');
		const html = editor.getHTML();

		expect(html).toContain('data-text-color="sora"');
		expect(html).not.toMatch(/style="[^"]*color:/);

		editor.destroy();
	});

	it('data-text-color 属性のみを持つ span を parseHTML で復元できる（style 属性なしでも往復する）', () => {
		const editor = new Editor({
			extensions: createEditorExtensions({ editable: true, placeholder: 'x' }),
			content: '<p><span data-text-color="kohaku">大事</span></p>',
		});

		const json = editor.getJSON();
		const textNode = json.content?.[0]?.content?.[0];

		expect(textNode?.marks).toEqual([{ type: 'textStyle', attrs: { textColor: 'kohaku' } }]);

		editor.destroy();
	});
});

import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from './createEditorExtensions';

/** 段落テキストを選択した状態のエディタを生成する（Req2.2/2.4 の選択範囲コマンド検証用） */
function makeEditorWithSelectedText(content = '<p>だいじな言葉</p>') {
	const editor = new Editor({
		extensions: createEditorExtensions({ editable: true, placeholder: 'x' }),
		content,
	});
	editor.commands.selectAll();
	return editor;
}

describe('SemanticMarker（Highlight 拡張・Task 3.2）', () => {
	it('setMarker で選択範囲へセマンティック名のみが JSON に残り hex が混入しない', () => {
		const editor = makeEditorWithSelectedText();

		editor.commands.setMarker('kiiro');
		const json = editor.getJSON();
		const textNode = json.content?.[0]?.content?.[0];

		expect(textNode?.marks).toEqual([{ type: 'highlight', attrs: { marker: 'kiiro' } }]);
		expect(JSON.stringify(json)).not.toMatch(/#[0-9a-fA-F]{3,6}/);
		expect(JSON.stringify(json)).not.toContain('background-color');

		editor.destroy();
	});

	it('unsetMarker で除去すると既定（マークなし）へ戻る', () => {
		const editor = makeEditorWithSelectedText();

		editor.commands.setMarker('kiiro');
		editor.commands.unsetMarker();
		const json = editor.getJSON();
		const textNode = json.content?.[0]?.content?.[0];

		expect(textNode?.marks ?? []).toEqual([]);

		editor.destroy();
	});

	it('HTML 出力は data-marker 属性のみで生の hex/background-color を出力しない', () => {
		const editor = makeEditorWithSelectedText();

		editor.commands.setMarker('midori');
		const html = editor.getHTML();

		expect(html).toContain('data-marker="midori"');
		expect(html).not.toMatch(/style="[^"]*background-color:/);

		editor.destroy();
	});

	it('data-marker 属性のみを持つ mark 要素を parseHTML で復元できる', () => {
		const editor = new Editor({
			extensions: createEditorExtensions({ editable: true, placeholder: 'x' }),
			content: '<p><mark data-marker="momo">大事</mark></p>',
		});

		const json = editor.getJSON();
		const textNode = json.content?.[0]?.content?.[0];

		expect(textNode?.marks).toEqual([{ type: 'highlight', attrs: { marker: 'momo' } }]);

		editor.destroy();
	});

	it('テキスト色・マーカー・既存装飾（太字）が同一 text ノード上で複数 mark として共存する', () => {
		const editor = makeEditorWithSelectedText();

		editor.commands.setTextColor('wakaba');
		editor.commands.setMarker('kiiro');
		editor.commands.toggleBold();

		const json = editor.getJSON();
		const marks = json.content?.[0]?.content?.[0]?.marks ?? [];
		const types = marks.map((m) => m.type).sort();

		expect(types).toEqual(['bold', 'highlight', 'textStyle']);

		editor.destroy();
	});
});

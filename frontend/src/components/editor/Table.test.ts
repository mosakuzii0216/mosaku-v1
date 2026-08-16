import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from './createEditorExtensions';

function makeEditor(content?: string) {
	return new Editor({
		extensions: createEditorExtensions({ editable: true, placeholder: 'x' }),
		content,
	});
}

describe('表（TableKit）（Task 5）', () => {
	it('insertTable でヘッダー行付きの複数行×複数列の表をカーソル位置に挿入する（Req3.1）', () => {
		const editor = makeEditor('<p></p>');
		editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });

		const json = editor.getJSON();
		const table = json.content?.find((n) => n.type === 'table');
		expect(table).toBeDefined();
		expect(table?.content).toHaveLength(3);
		expect(table?.content?.[0]?.content?.every((cell) => cell.type === 'tableHeader')).toBe(true);
		expect(table?.content?.[0]?.content).toHaveLength(3);
		expect(table?.content?.[1]?.content?.every((cell) => cell.type === 'tableCell')).toBe(true);
		editor.destroy();
	});

	it('セル内のテキスト入力・編集とインライン装飾（太字）を許可する（Req3.2）', () => {
		const editor = makeEditor(
			'<table><tbody><tr><td><p>本文</p></td><td><p></p></td></tr></tbody></table>',
		);
		// 1つ目のセル本文（"本文"）を範囲選択して太字を適用する
		editor.commands.setTextSelection({ from: 4, to: 6 });
		editor.commands.toggleBold();

		const json = editor.getJSON();
		const table = json.content?.find((n) => n.type === 'table');
		const firstCellText = table?.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0];
		expect(firstCellText?.text).toBe('本文');
		expect(firstCellText?.marks?.[0]?.type).toBe('bold');
		editor.destroy();
	});

	it('Tab で次セルへ、Shift-Tab で前セルへキャレットを移動する（Req3.5）', () => {
		const editor = makeEditor('<p></p>');
		editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
		editor.commands.setTextSelection(3); // 1つ目のヘッダーセル内

		const movedNext = editor.commands.goToNextCell();
		expect(movedNext).toBe(true);
		const posAfterNext = editor.state.selection.from;

		const movedPrev = editor.commands.goToPreviousCell();
		expect(movedPrev).toBe(true);
		expect(editor.state.selection.from).not.toBe(posAfterNext);
		editor.destroy();
	});

	it('行・列の追加/削除、表全体削除の操作手段を提供する（Req3.3/3.4）', () => {
		const editor = makeEditor('<p></p>');
		editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
		editor.commands.setTextSelection(3);

		expect(editor.can().addRowAfter()).toBe(true);
		expect(editor.can().addColumnAfter()).toBe(true);
		editor.commands.addRowAfter();
		editor.commands.addColumnAfter();
		let table = editor.getJSON().content?.find((n) => n.type === 'table');
		expect(table?.content).toHaveLength(3);
		expect(table?.content?.[0]?.content).toHaveLength(3);

		expect(editor.can().deleteRow()).toBe(true);
		editor.commands.deleteRow();
		table = editor.getJSON().content?.find((n) => n.type === 'table');
		expect(table?.content).toHaveLength(2);

		expect(editor.can().deleteTable()).toBe(true);
		editor.commands.deleteTable();
		table = editor.getJSON().content?.find((n) => n.type === 'table');
		expect(table).toBeUndefined();
		editor.destroy();
	});

	it('.tableWrapper で表を包んで renderHTML する（Req3.6 の横スクロール前提・編集/公開共通）', () => {
		const editable = makeEditor('<p></p>');
		editable.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
		const editHtml = editable.getHTML();
		editable.destroy();

		const publicView = new Editor({
			extensions: createEditorExtensions({ editable: false }),
			content: editHtml,
		});
		const publicHtml = publicView.getHTML();
		publicView.destroy();

		expect(editHtml).toContain('class="tableWrapper"');
		expect(publicHtml).toContain('class="tableWrapper"');
	});

	it('編集・公開の単一情報源に editable 非依存で登録されている（Req6.1）', () => {
		const editableEditor = new Editor({ extensions: createEditorExtensions({ editable: true }) });
		const publicEditor = new Editor({ extensions: createEditorExtensions({ editable: false }) });
		expect(editableEditor.schema.nodes.table).toBeDefined();
		expect(publicEditor.schema.nodes.table).toBeDefined();
		editableEditor.destroy();
		publicEditor.destroy();
	});
});

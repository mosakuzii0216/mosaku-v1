import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from './createEditorExtensions';

function makeEditor(content?: string) {
	return new Editor({
		extensions: createEditorExtensions({ editable: true, placeholder: 'x' }),
		content,
	});
}

describe('Callout node（Task 4.1/4.2）', () => {
	it('スキーマが group:block / content:block+ / defining で登録されている', () => {
		const editor = makeEditor();
		const calloutType = editor.schema.nodes.callout;
		expect(calloutType).toBeDefined();
		expect(calloutType.spec.group).toBe('block');
		expect(calloutType.spec.content).toBe('block+');
		expect(calloutType.spec.defining).toBe(true);
		editor.destroy();
	});

	it('編集・公開の単一情報源に editable 非依存で登録されている（Req6.1）', () => {
		const editable = new Editor({ extensions: createEditorExtensions({ editable: true }) });
		const publicView = new Editor({ extensions: createEditorExtensions({ editable: false }) });
		expect(editable.schema.nodes.callout).toBeDefined();
		expect(publicView.schema.nodes.callout).toBeDefined();
		editable.destroy();
		publicView.destroy();
	});

	it('setCallout でカーソル位置に既定 variant（point）のコールアウトを挿入する（Req1.1）', () => {
		const editor = makeEditor('<p></p>');
		editor.commands.setCallout();
		const json = editor.getJSON();
		const callout = json.content?.find((n) => n.type === 'callout');
		expect(callout?.attrs?.variant).toBe('point');
		expect(callout?.content?.[0]?.type).toBe('paragraph');
		editor.destroy();
	});

	it('setCallout に variant を渡すとその種別で挿入する（Req1.2）', () => {
		const editor = makeEditor('<p></p>');
		editor.commands.setCallout('warning');
		const json = editor.getJSON();
		const callout = json.content?.find((n) => n.type === 'callout');
		expect(callout?.attrs?.variant).toBe('warning');
		editor.destroy();
	});

	it('data-callout / data-variant 属性で renderHTML する', () => {
		const editor = makeEditor();
		editor.commands.setCallout('warning');
		const html = editor.getHTML();
		expect(html).toContain('data-callout');
		expect(html).toContain('data-variant="warning"');
		editor.destroy();
	});

	it('data-callout/data-variant を持つ HTML を parseHTML で復元する（Req6.2/6.3）', () => {
		const editor = makeEditor('<div data-callout data-variant="warning"><p>注意本文</p></div>');
		const json = editor.getJSON();
		const callout = json.content?.find((n) => n.type === 'callout');
		expect(callout?.attrs?.variant).toBe('warning');
		expect(callout?.content?.[0]?.content?.[0]?.text).toBe('注意本文');
		editor.destroy();
	});

	it('variant 属性を省略すると既定 point へフォールバックして復元する', () => {
		const editor = makeEditor('<div data-callout><p>本文</p></div>');
		const json = editor.getJSON();
		const callout = json.content?.find((n) => n.type === 'callout');
		expect(callout?.attrs?.variant).toBe('point');
		editor.destroy();
	});

	it('未知 variant は JSON にそのまま保持される（前方互換・JSON は保持）', () => {
		const editor = makeEditor('<div data-callout data-variant="mystery"><p>本文</p></div>');
		const json = editor.getJSON();
		const callout = json.content?.find((n) => n.type === 'callout');
		expect(callout?.attrs?.variant).toBe('mystery');
		editor.destroy();
	});

	it('種別変更（updateAttributes）で本文テキストを保持したまま variant のみが切り替わる（Req1.3）', () => {
		const editor = makeEditor();
		editor.commands.setCallout('point');
		editor.commands.insertContent('大事な本文');
		editor.commands.updateAttributes('callout', { variant: 'warning' });

		const json = editor.getJSON();
		const callout = json.content?.find((n) => n.type === 'callout');
		expect(callout?.attrs?.variant).toBe('warning');
		expect(callout?.content?.[0]?.content?.[0]?.text).toBe('大事な本文');
		editor.destroy();
	});

	it('本文複数段落・インライン装飾を許可する（Req1.4）', () => {
		const editor = makeEditor(
			'<div data-callout data-variant="point"><p>1行目</p><p><strong>太字</strong>2行目</p></div>',
		);
		const json = editor.getJSON();
		const callout = json.content?.find((n) => n.type === 'callout');
		expect(callout?.content).toHaveLength(2);
		expect(callout?.content?.[1]?.content?.[0]?.marks?.[0]?.type).toBe('bold');
		editor.destroy();
	});

	// exitCalloutAtEnd は ArrowDown / Mod-Enter の両方から呼ばれる共有の脱出コマンド
	// （addKeyboardShortcuts が両キーをこのコマンドへ束ねている）。
	// `editor.commands.keyboardShortcut(name)` によるキー入力シミュレーションは内部で
	// captureTransaction を介して各ステップを再生するテスト用ヘルパーだが、setSelection の
	// ような tr メタは再生対象に含まれない実装上の制約があるため、ここではコマンドを直接呼び
	// doc 構造とキャレット位置の両方を確実に検証する（実際のキー入力では通常の keymap 経由で
	// 直接 dispatch されるため、この制約は影響しない）。
	it('本文末尾で exitCalloutAtEnd（Mod-Enter/ArrowDown 共有ロジック）を実行するとキャレットがコールアウトの外（直後の新しい段落）へ移動する（Req1.5）', () => {
		const editor = makeEditor('<div data-callout data-variant="point"><p>本文</p></div>');
		editor.commands.selectTextblockEnd();
		const result = editor.commands.exitCalloutAtEnd();
		expect(result).toBe(true);

		const json = editor.getJSON();
		expect(json.content?.[0]?.type).toBe('callout');
		expect(json.content?.[1]?.type).toBe('paragraph');

		const { $from } = editor.state.selection;
		expect($from.parent.type.name).toBe('paragraph');
		let insideCallout = false;
		for (let d = $from.depth; d > 0; d -= 1) {
			if ($from.node(d).type.name === 'callout') insideCallout = true;
		}
		expect(insideCallout).toBe(false);
		editor.destroy();
	});

	it('ArrowDown / Mod-Enter の両方が exitCalloutAtEnd に束ねられている', () => {
		const editor = makeEditor();
		const calloutExtension = editor.extensionManager.extensions.find((e) => e.name === 'callout');
		const shortcuts = calloutExtension?.config.addKeyboardShortcuts?.call(calloutExtension) ?? {};
		expect(Object.keys(shortcuts)).toEqual(expect.arrayContaining(['ArrowDown', 'Mod-Enter']));
		editor.destroy();
	});

	it('コールアウトが doc 末尾にある場合、TrailingNode が既に挿入した段落を再利用し二重挿入しない', () => {
		// StarterKit 標準 TrailingNode は doc 末尾が非デフォルト型ノード（callout）のとき
		// トランザクションのたびに末尾へ空段落を自動挿入する。本文末尾脱出時に新規段落を
		// 無条件で挿入すると、この自動挿入分と合わせて2つ生成されてしまうため、既存ノードが
		// あれば再利用する必要がある（実装時に判明した回帰）。
		const editor = makeEditor('<div data-callout data-variant="point"><p>本文</p></div>');
		editor.commands.selectTextblockEnd();
		editor.commands.exitCalloutAtEnd();

		const json = editor.getJSON();
		expect(json.content).toHaveLength(2);
		expect(json.content?.[1]?.type).toBe('paragraph');
		editor.destroy();
	});

	it('本文途中では Mod-Enter/ArrowDown による脱出は発火しない', () => {
		const editor = makeEditor(
			'<div data-callout data-variant="point"><p>1行目</p><p>2行目</p></div>',
		);
		// 1行目末尾（末尾段落ではない）にキャレットを置く
		editor.commands.setTextSelection(5);
		const result = editor.commands.exitCalloutAtEnd();
		expect(result).toBe(false);

		let insideCallout = false;
		const { $from } = editor.state.selection;
		for (let d = $from.depth; d > 0; d -= 1) {
			if ($from.node(d).type.name === 'callout') insideCallout = true;
		}
		expect(insideCallout).toBe(true);
		editor.destroy();
	});

	it('deleteNode でコールアウトを本文ごと削除できる（Req1.6）', () => {
		const editor = makeEditor(
			'<div data-callout data-variant="point"><p>消える本文</p></div><p>後続段落</p>',
		);
		editor.commands.setTextSelection(3);
		editor.commands.deleteNode('callout');

		const json = editor.getJSON();
		expect(json.content?.some((n) => n.type === 'callout')).toBe(false);
		expect(JSON.stringify(json)).not.toContain('消える本文');
		expect(json.content?.some((n) => n.content?.[0]?.text === '後続段落')).toBe(true);
		editor.destroy();
	});
});

import { describe, it, expect, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/react';
import { createEditorExtensions } from './createEditorExtensions';
import { decideContentSync, isJsonContentEqual } from './contentSync';

const dummySlash = { render: () => ({}) };

function makeEditor(onUpdate?: (props: { editor: Editor }) => void) {
	return new Editor({
		extensions: createEditorExtensions({ editable: true, placeholder: 'x', slash: dummySlash }),
		...(onUpdate ? { onUpdate } : {}),
	});
}

/**
 * テスト環境（jsdom）で ProseMirror の input rule を発火させるための入力シミュレータ。
 */
function typeText(editor: Editor, text: string) {
	const { view } = editor;
	for (const char of text) {
		const { from, to } = view.state.selection;
		const handled = view.someProp('handleTextInput', (f) => f(view, from, to, char));
		if (!handled) {
			view.dispatch(view.state.tr.insertText(char, from, to));
		}
	}
}

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };
const DOC_A: JSONContent = {
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
};
const DOC_B: JSONContent = {
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }],
};
const DOC_NEW: JSONContent = {
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text: 'new' }] }],
};

describe('isJsonContentEqual（キー順非依存の構造的等価）', () => {
	it('同一オブジェクト参照は等価', () => {
		expect(isJsonContentEqual(EMPTY_DOC, EMPTY_DOC)).toBe(true);
	});

	it('同一構造の別オブジェクトは等価', () => {
		const a: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };
		const b: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };
		expect(isJsonContentEqual(a, b)).toBe(true);
	});

	it('キー順が違っても等価（Req3.4）', () => {
		const a: JSONContent = { content: [{ type: 'paragraph' }], type: 'doc' } as JSONContent;
		const b: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };
		expect(isJsonContentEqual(a, b)).toBe(true);
	});

	it('テキストが違えば不等価', () => {
		expect(isJsonContentEqual(DOC_A, DOC_B)).toBe(false);
	});

	it('content 配列の長さが違えば不等価', () => {
		const a: JSONContent = {
			type: 'doc',
			content: [{ type: 'paragraph' }, { type: 'paragraph' }],
		};
		expect(isJsonContentEqual(a, EMPTY_DOC)).toBe(false);
	});

	it('配列の順序は保持（順序が異なれば不等価）', () => {
		const a: JSONContent = {
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: '1' }] },
				{ type: 'paragraph', content: [{ type: 'text', text: '2' }] },
			],
		};
		const b: JSONContent = {
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: '2' }] },
				{ type: 'paragraph', content: [{ type: 'text', text: '1' }] },
			],
		};
		expect(isJsonContentEqual(a, b)).toBe(false);
	});

	it('ネストされた attrs を含む doc を正しく比較する', () => {
		const a: JSONContent = {
			type: 'doc',
			content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'X' }] }],
		};
		const b: JSONContent = {
			type: 'doc',
			content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'X' }] }],
		};
		expect(isJsonContentEqual(a, b)).toBe(true);
	});

	it('attrs の値が異なれば不等価', () => {
		const a: JSONContent = {
			type: 'doc',
			content: [{ type: 'heading', attrs: { level: 1 } }],
		};
		const b: JSONContent = {
			type: 'doc',
			content: [{ type: 'heading', attrs: { level: 2 } }],
		};
		expect(isJsonContentEqual(a, b)).toBe(false);
	});
});

describe('decideContentSync（JSON 構造的等価による分岐判定）', () => {
	it('content が直近 emit した JSON と構造的等価のとき skip-echo（自己エコー）', () => {
		expect(decideContentSync({ content: DOC_A, lastEmitted: DOC_A, currentJson: DOC_B })).toBe(
			'skip-echo',
		);
	});

	it('content が現在のエディタ内容と等価のとき skip-equal', () => {
		expect(decideContentSync({ content: DOC_A, lastEmitted: DOC_B, currentJson: DOC_A })).toBe(
			'skip-equal',
		);
	});

	it('content が直近 emit とも現在内容とも異なるとき apply（外部変更）', () => {
		expect(decideContentSync({ content: DOC_NEW, lastEmitted: DOC_A, currentJson: DOC_B })).toBe(
			'apply',
		);
	});

	it('自己エコーは等価判定より優先される（3 値一致でも skip-echo）', () => {
		expect(decideContentSync({ content: DOC_A, lastEmitted: DOC_A, currentJson: DOC_A })).toBe(
			'skip-echo',
		);
	});

	it('キー順が違う同一 JSON は skip-echo になる（Req3.4）', () => {
		const emitted: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };
		const received: JSONContent = { content: [{ type: 'paragraph' }], type: 'doc' } as JSONContent;
		expect(decideContentSync({ content: received, lastEmitted: emitted, currentJson: DOC_B })).toBe(
			'skip-echo',
		);
	});
});

describe('content 同期の結合（保存ループ防止・外部反映・Undo）', () => {
	it('onUpdate→ref→onChange→親 content 反映→ sync skip-echo の一巡で setContent が走らない', () => {
		const onChange = vi.fn();
		const lastEmittedRef: { current: JSONContent } = {
			current: { type: 'doc', content: [{ type: 'paragraph' }] },
		};
		const editor = makeEditor(({ editor }) => {
			const json = editor.getJSON();
			lastEmittedRef.current = json;
			onChange(json);
		});

		typeText(editor, 'hello');

		expect(onChange).toHaveBeenCalled();
		const emitted = onChange.mock.calls.at(-1)![0] as JSONContent;
		expect(isJsonContentEqual(lastEmittedRef.current, emitted)).toBe(true);

		// 親が content を emitted へ更新し再レンダリングした想定 → sync 判定は自己エコー
		const decision = decideContentSync({
			content: emitted,
			lastEmitted: lastEmittedRef.current,
			currentJson: editor.getJSON(),
		});
		expect(decision).toBe('skip-echo');

		editor.destroy();
	});

	it('外部 content 反映は emitUpdate:false で onChange を発火しない（自動保存スケジュールしない）', () => {
		const onChange = vi.fn();
		const editor = makeEditor(({ editor }) => onChange(editor.getJSON()));

		typeText(editor, 'hello');
		onChange.mockClear();

		const external: JSONContent = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: '外部から来た内容' }] }],
		};
		const decision = decideContentSync({
			content: external,
			lastEmitted: editor.getJSON(),
			currentJson: editor.getJSON(),
		});
		expect(decision).toBe('apply');

		editor.commands.setContent(external, { emitUpdate: false });

		expect(onChange).not.toHaveBeenCalled();
		expect(editor.getText()).toContain('外部から来た内容');

		editor.destroy();
	});

	it('`# ` 入力で即 H1 変換され、続けてタイプしても巻き戻らない（input rule 不変条件）', () => {
		const editor = makeEditor();

		typeText(editor, '# ');
		expect(editor.isActive('heading', { level: 1 })).toBe(true);

		typeText(editor, 'Hello');
		expect(editor.isActive('heading', { level: 1 })).toBe(true);
		expect(editor.getHTML()).toContain('<h1');
		expect(editor.getText()).toContain('Hello');

		editor.destroy();
	});
});

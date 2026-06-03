import { describe, it, expect, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from './createEditorExtensions';
import { decideContentSync } from './contentSync';

const dummySlash = { render: () => ({}) };

function makeEditor(onUpdate?: (props: { editor: Editor }) => void) {
	return new Editor({
		extensions: createEditorExtensions({ editable: true, placeholder: 'x', slash: dummySlash }),
		...(onUpdate ? { onUpdate } : {}),
	});
}

/**
 * テスト環境（jsdom）で ProseMirror の input rule を発火させるための入力シミュレータ。
 * 1 文字ずつ `handleTextInput` を呼び、ルールが処理しなければ通常挿入する
 * （実際のタイプと同じ経路で input rule を成立させる）。
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

describe('decideContentSync（content 同期の分岐判定）', () => {
	it('content が直近 emit した HTML と一致するとき skip-echo（自己エコー・Req1.6）', () => {
		expect(
			decideContentSync({ content: '<p>a</p>', lastEmitted: '<p>a</p>', currentHtml: '<p>b</p>' }),
		).toBe('skip-echo');
	});

	it('content が現在のエディタ内容と等価のとき skip-equal（Req1.6）', () => {
		expect(
			decideContentSync({ content: '<p>a</p>', lastEmitted: '<p>x</p>', currentHtml: '<p>a</p>' }),
		).toBe('skip-equal');
	});

	it('content が直近 emit とも現在内容とも異なるとき apply（外部変更・Req1.4/1.5）', () => {
		expect(
			decideContentSync({
				content: '<p>new</p>',
				lastEmitted: '<p>old</p>',
				currentHtml: '<p>cur</p>',
			}),
		).toBe('apply');
	});

	it('自己エコーは等価判定より優先される（3 値一致でも skip-echo）', () => {
		expect(
			decideContentSync({ content: '<p>a</p>', lastEmitted: '<p>a</p>', currentHtml: '<p>a</p>' }),
		).toBe('skip-echo');
	});
});

describe('content 同期の結合（保存ループ防止・外部反映・Undo）', () => {
	it('onUpdate→ref→onChange→親 content 反映→ sync skip-echo の一巡で setContent が走らない（Req8.4）', () => {
		const onChange = vi.fn();
		const lastEmittedHtmlRef = { current: '<p></p>' };
		const editor = makeEditor(({ editor }) => {
			const html = editor.getHTML();
			lastEmittedHtmlRef.current = html;
			onChange(html);
		});

		typeText(editor, 'hello');

		expect(onChange).toHaveBeenCalled();
		const emitted = onChange.mock.calls.at(-1)![0] as string;
		// onUpdate で ref に最新 HTML が保持されている（Req8.1）
		expect(lastEmittedHtmlRef.current).toBe(emitted);

		// 親が content を emitted へ更新し再レンダリングした想定 → sync 判定は自己エコー
		const decision = decideContentSync({
			content: emitted,
			lastEmitted: lastEmittedHtmlRef.current,
			currentHtml: editor.getHTML(),
		});
		expect(decision).toBe('skip-echo'); // apply しない＝保存ループが発生しない

		editor.destroy();
	});

	it('外部 content 反映は emitUpdate:false で onChange を発火しない（自動保存スケジュールしない・Req1.5/8.4）', () => {
		const onChange = vi.fn();
		const editor = makeEditor(({ editor }) => onChange(editor.getHTML()));

		typeText(editor, 'hello');
		onChange.mockClear();

		const external = '<p>外部から来た内容</p>';
		const decision = decideContentSync({
			content: external,
			lastEmitted: editor.getHTML(),
			currentHtml: editor.getHTML(),
		});
		expect(decision).toBe('apply');

		editor.commands.setContent(external, { emitUpdate: false });

		expect(onChange).not.toHaveBeenCalled();
		expect(editor.getHTML()).toContain('外部から来た内容');

		editor.destroy();
	});

	it('`# ` 入力で即 H1 変換され、続けてタイプしても巻き戻らない（Req1.1/1.2 — content 同期バグ修正の核心）', () => {
		// このエディタには content 同期 useEffect（setContent 全置換）が介在しないため、
		// input rule のトランザクションが巻き戻されないことを構造的に保証する。
		const editor = makeEditor();

		typeText(editor, '# ');
		expect(editor.isActive('heading', { level: 1 })).toBe(true);

		// 変換後も続けて入力 → 見出しのまま本文が積まれ、段落へ巻き戻らない（Req1.2）
		typeText(editor, 'Hello');
		expect(editor.isActive('heading', { level: 1 })).toBe(true);
		expect(editor.getHTML()).toContain('<h1');
		expect(editor.getText()).toContain('Hello');

		editor.destroy();
	});

	// 注: Req2.9（変換直後の Ctrl/Cmd+Z が Markdown 記法テキストへ戻る）は、
	// ProseMirror history のグルーピングが実キーストロークのタイミングに依存するため、
	// jsdom の同期シミュレーションでは忠実に再現できない。E2E（タスク 5.2）で検証する。
});

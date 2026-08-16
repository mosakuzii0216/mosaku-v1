import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { createEditorExtensions } from './createEditorExtensions';
import { suggestion, setNotebooksData } from './suggestion';

/**
 * suggestion.ts の render() は `@tiptap/react` の `ReactRenderer` を使うため、
 * `EditorContent` 経由でマウントされた editor（`contentComponent` を持つ）でないと
 * ポップアップの中身が実際に DOM へ描画されない（スタンドアロン Editor では空のまま）。
 * この最小ハーネスで実 Editor を EditorContent にマウントし、`insertContent('/')` で
 * スラッシュ起動を再現する（実キー入力の jsdom シミュレーションは ProseMirror の
 * contentEditable 処理を再現できないため不可・insertContent は同じトランザクション経路で
 * Suggestion プラグインの検出を経由するため代替として妥当）。
 */
function TestHarness({ onReady }: { onReady: (editor: Editor) => void }) {
	const editor = useEditor({
		extensions: createEditorExtensions({
			editable: true,
			placeholder: 'x',
			slash: { render: suggestion.render },
		}),
		content: '<p></p>',
	});

	React.useEffect(() => {
		if (editor) {
			onReady(editor);
		}
	}, [editor, onReady]);

	if (!editor) {
		return null;
	}
	return <EditorContent editor={editor} />;
}

async function mountWithSlash(): Promise<Editor> {
	let editorRef: Editor | null = null;
	render(<TestHarness onReady={(e) => (editorRef = e)} />);
	await waitFor(() => expect(editorRef).not.toBeNull());
	const editor = editorRef!;
	act(() => {
		editor.commands.focus();
		editor.commands.insertContent('/');
	});
	await waitFor(() => expect(screen.getByText('見出し1')).toBeTruthy());
	return editor;
}

describe('suggestion.render × RichTextEditor 統合（palette モード遷移・Task 7.2 / Req5.3）', () => {
	afterEach(() => {
		cleanup();
	});

	it('root に「テキスト色」「マーカー」が表示される（Req5.1）', async () => {
		setNotebooksData([]);
		await mountWithSlash();
		expect(screen.getByText('テキスト色')).toBeTruthy();
		expect(screen.getByText('マーカー')).toBeTruthy();
	});

	it('「テキスト色」を選ぶと doc を変更せず palette（textColor）スウォッチへ遷移する（Req5.3）', async () => {
		setNotebooksData([]);
		const editor = await mountWithSlash();
		const before = editor.getText();

		act(() => {
			screen.getByText('テキスト色').click();
		});

		await waitFor(() => expect(screen.getByText('若葉')).toBeTruthy());
		expect(editor.getText()).toBe(before);
		expect(screen.queryByText('見出し1')).toBeNull();
	});

	it('palette（textColor）でスウォッチを確定すると range（/クエリ）が削除され、以降入力へ色が適用される（Req5.3/5.4）', async () => {
		setNotebooksData([]);
		const editor = await mountWithSlash();

		act(() => {
			screen.getByText('テキスト色').click();
		});
		await waitFor(() => expect(screen.getByText('若葉')).toBeTruthy());

		act(() => {
			screen.getByText('若葉').click();
		});

		await waitFor(() => expect(editor.getText()).toBe(''));
		act(() => {
			editor.commands.insertContent('あとから入力');
		});
		const json = editor.getJSON();
		const textNode = json.content?.[0]?.content?.[0];
		expect(textNode?.marks?.[0]?.type).toBe('textStyle');
		expect(textNode?.marks?.[0]?.attrs?.textColor).toBe('wakaba');
	});

	it('palette モードで「戻る」を押すと root モードへ復帰する（Req5.3、notebook と同じ復帰契約）', async () => {
		setNotebooksData([]);
		await mountWithSlash();

		act(() => {
			screen.getByText('テキスト色').click();
		});
		await waitFor(() => expect(screen.getByText('若葉')).toBeTruthy());

		act(() => {
			screen.getByRole('button', { name: /戻る/ }).click();
		});

		await waitFor(() => expect(screen.getByText('見出し1')).toBeTruthy());
		expect(screen.queryByText('若葉')).toBeNull();
	});
});

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import { useEditor, EditorContent, type Editor, type JSONContent } from '@tiptap/react';
import { createEditorExtensions } from './createEditorExtensions';
import { EditorBubbleMenu } from './EditorBubbleMenu';

/**
 * `@tiptap/react/menus` の BubbleMenu は floating-ui プラグインとして
 * `view.dom.parentElement`（または appendTo）へポータル要素を実際に
 * appendChild/remove するため、`EditorContent` 経由で実 DOM にマウントしないと
 * 表示/非表示が検証できない（suggestion.test.tsx と同じ制約）。
 */
function TestHarness({
	onReady,
	content,
}: {
	onReady: (editor: Editor) => void;
	content?: JSONContent | string;
}) {
	const editor = useEditor({
		extensions: createEditorExtensions({ editable: true, placeholder: 'x' }),
		content: content ?? '<p>本文</p>',
	});

	React.useEffect(() => {
		if (editor) {
			onReady(editor);
		}
	}, [editor, onReady]);

	if (!editor) {
		return null;
	}
	return (
		<>
			<EditorContent editor={editor} />
			<EditorBubbleMenu editor={editor} />
		</>
	);
}

async function mount(content?: JSONContent | string): Promise<Editor> {
	let editorRef: Editor | null = null;
	render(<TestHarness onReady={(e) => (editorRef = e)} content={content} />);
	await waitFor(() => expect(editorRef).not.toBeNull());
	return editorRef!;
}

describe('EditorBubbleMenu（Task 8・Req2.1/2.2/2.4/3.3/3.4/1.3）', () => {
	afterEach(() => {
		cleanup();
	});

	it('選択なし・表/コールアウト外では何も表示しない', async () => {
		const editor = await mount();
		act(() => {
			editor.commands.setTextSelection(1);
		});
		await waitFor(() => {
			expect(screen.queryByRole('group', { name: 'テキスト色/マーカー' })).toBeNull();
		});
	});

	it('テキスト選択時にセマンティック色/マーカーのスウォッチと「デフォルトに戻す」を表示する（Req2.1/2.2）', async () => {
		const editor = await mount('<p>本文テキスト</p>');
		act(() => {
			editor.commands.setTextSelection({ from: 1, to: 3 });
		});

		await waitFor(() => expect(screen.getByText('若葉')).toBeTruthy());
		expect(screen.getByText('黄')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'デフォルトに戻す' })).toBeTruthy();
	});

	it('テキスト色スウォッチをクリックすると選択範囲へ適用される（Req2.1/2.5）', async () => {
		const editor = await mount('<p>本文テキスト</p>');
		act(() => {
			editor.commands.setTextSelection({ from: 1, to: 3 });
		});
		await waitFor(() => expect(screen.getByText('若葉')).toBeTruthy());

		act(() => {
			screen.getByText('若葉').click();
		});

		const json = editor.getJSON();
		const textNode = json.content?.[0]?.content?.[0];
		expect(
			textNode?.marks?.some((m) => m.type === 'textStyle' && m.attrs?.textColor === 'wakaba'),
		).toBe(true);
	});

	it('マーカースウォッチをクリックすると選択範囲へ適用される（Req2.2/2.5）', async () => {
		const editor = await mount('<p>本文テキスト</p>');
		act(() => {
			editor.commands.setTextSelection({ from: 1, to: 3 });
		});
		await waitFor(() => expect(screen.getByText('黄')).toBeTruthy());

		act(() => {
			screen.getByText('黄').click();
		});

		const json = editor.getJSON();
		const textNode = json.content?.[0]?.content?.[0];
		expect(
			textNode?.marks?.some((m) => m.type === 'highlight' && m.attrs?.marker === 'kiiro'),
		).toBe(true);
	});

	it('「デフォルトに戻す」で適用済みのテキスト色/マーカーを除去する（Req2.4）', async () => {
		const editor = await mount('<p>本文テキスト</p>');
		act(() => {
			editor.commands.setTextSelection({ from: 1, to: 3 });
			editor.commands.setTextColor('wakaba');
			editor.commands.setMarker('kiiro');
		});
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'デフォルトに戻す' })).toBeTruthy(),
		);

		act(() => {
			screen.getByRole('button', { name: 'デフォルトに戻す' }).click();
		});

		const json = editor.getJSON();
		const textNode = json.content?.[0]?.content?.[0];
		expect(textNode?.marks ?? []).toHaveLength(0);
	});

	it('キャレットが表内にあるとき行/列の追加・削除・表全体削除を提示する（Req3.3/3.4）', async () => {
		const editor = await mount('<p></p>');
		act(() => {
			editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
			editor.commands.setTextSelection(3);
		});

		await waitFor(() => expect(screen.getByRole('button', { name: '表全体を削除' })).toBeTruthy());
		expect(screen.getByRole('button', { name: '行を上に追加' })).toBeTruthy();
		expect(screen.getByRole('button', { name: '行を下に追加' })).toBeTruthy();
		expect(screen.getByRole('button', { name: '行を削除' })).toBeTruthy();
		expect(screen.getByRole('button', { name: '列を左に追加' })).toBeTruthy();
		expect(screen.getByRole('button', { name: '列を右に追加' })).toBeTruthy();
		expect(screen.getByRole('button', { name: '列を削除' })).toBeTruthy();
	});

	it('表の操作ボタンをクリックすると対応する TableKit コマンドが実行される（Req3.3/3.4）', async () => {
		const editor = await mount('<p></p>');
		act(() => {
			editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
			editor.commands.setTextSelection(3);
		});
		await waitFor(() => expect(screen.getByRole('button', { name: '行を下に追加' })).toBeTruthy());

		act(() => {
			screen.getByRole('button', { name: '行を下に追加' }).click();
		});

		const table = editor.getJSON().content?.find((n) => n.type === 'table');
		expect(table?.content).toHaveLength(3);
	});

	it('表外・コールアウト外では表操作ボタンを表示しない', async () => {
		const editor = await mount('<p>本文</p>');
		act(() => {
			editor.commands.setTextSelection(1);
		});
		await waitFor(() => {
			expect(screen.queryByRole('button', { name: '表全体を削除' })).toBeNull();
		});
	});

	it('キャレットがコールアウト内にあるとき種別変更ボタンを提示する（Req1.3）', async () => {
		const editor = await mount('<p></p>');
		act(() => {
			editor.commands.setCallout();
			editor.commands.setTextSelection(2);
		});

		await waitFor(() => expect(screen.getByRole('button', { name: /⚠️ 注意/ })).toBeTruthy());
		expect(screen.getByRole('button', { name: /💡 ポイント/ })).toBeTruthy();
	});

	it('種別変更ボタンをクリックすると本文を保ったまま variant のみ切り替わる（Req1.3）', async () => {
		const editor = await mount('<p></p>');
		act(() => {
			editor.commands.setCallout();
			editor.commands.insertContent('大事な注意事項');
			editor.commands.setTextSelection(editor.state.selection.from);
		});
		await waitFor(() => expect(screen.getByRole('button', { name: /⚠️ 注意/ })).toBeTruthy());

		act(() => {
			screen.getByRole('button', { name: /⚠️ 注意/ }).click();
		});

		const json = editor.getJSON();
		const callout = json.content?.find((n) => n.type === 'callout');
		expect(callout?.attrs?.variant).toBe('warning');
		expect(callout?.content?.[0]?.content?.[0]?.text).toBe('大事な注意事項');
	});

	it('editable=false（公開ビュー相当）では表示されない', async () => {
		function ReadOnlyHarness({ onReady }: { onReady: (editor: Editor) => void }) {
			const editor = useEditor({
				extensions: createEditorExtensions({ editable: false }),
				content: '<p>本文テキスト</p>',
				editable: false,
			});
			React.useEffect(() => {
				if (editor) {
					onReady(editor);
				}
			}, [editor, onReady]);
			if (!editor) {
				return null;
			}
			return (
				<>
					<EditorContent editor={editor} />
					<EditorBubbleMenu editor={editor} />
				</>
			);
		}

		let editorRef: Editor | null = null;
		render(<ReadOnlyHarness onReady={(e) => (editorRef = e)} />);
		await waitFor(() => expect(editorRef).not.toBeNull());
		const editor = editorRef!;

		act(() => {
			editor.commands.setTextSelection({ from: 1, to: 3 });
		});

		await waitFor(() => {
			expect(screen.queryByText('若葉')).toBeNull();
		});
	});
});

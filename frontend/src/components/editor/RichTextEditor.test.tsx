import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RichTextEditor } from './RichTextEditor';
import { useEditorFocusStore } from '../../stores/useEditorFocusStore';

vi.mock('../../hooks/useNotebookQueries', () => ({
	useNotebooks: () => ({ data: [], isLoading: false }),
}));

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

describe('RichTextEditor - EditorFocusStore 連携', () => {
	beforeEach(() => {
		useEditorFocusStore.setState({ isEditorFocused: false });
		cleanup();
	});

	it('エディタにフォーカスすると isEditorFocused が true になる', async () => {
		const { container } = render(<RichTextEditor content="" onChange={() => {}} />, {
			wrapper: createWrapper(),
		});

		const prosemirror = container.querySelector('.ProseMirror');
		expect(prosemirror).not.toBeNull();

		prosemirror!.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

		expect(useEditorFocusStore.getState().isEditorFocused).toBe(true);
	});

	it('エディタからブラーすると isEditorFocused が false になる', async () => {
		const { container } = render(<RichTextEditor content="" onChange={() => {}} />, {
			wrapper: createWrapper(),
		});

		const prosemirror = container.querySelector('.ProseMirror');

		prosemirror!.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
		expect(useEditorFocusStore.getState().isEditorFocused).toBe(true);

		prosemirror!.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
		expect(useEditorFocusStore.getState().isEditorFocused).toBe(false);
	});

	it('アンマウント時に isEditorFocused が false にリセットされる', () => {
		const { unmount } = render(<RichTextEditor content="" onChange={() => {}} />, {
			wrapper: createWrapper(),
		});

		useEditorFocusStore.getState().setEditorFocused(true);
		expect(useEditorFocusStore.getState().isEditorFocused).toBe(true);

		unmount();

		expect(useEditorFocusStore.getState().isEditorFocused).toBe(false);
	});
});

describe('RichTextEditor - ツールバー非回帰（共有ファクトリ移行後）', () => {
	beforeEach(() => {
		useEditorFocusStore.setState({ isEditorFocused: false });
		cleanup();
	});

	// 共有ファクトリ（createEditorExtensions）移行で既存ツールバーが欠落していないことを担保する（Req9.1）
	const TOOLBAR_LABELS = ['太字', '斜体', '取消線', 'H1', 'H2', '・リスト', '1.リスト', '引用'];

	it('従来のツールバーボタンがすべて存在する', () => {
		render(<RichTextEditor content="<p>本文</p>" onChange={() => {}} />, {
			wrapper: createWrapper(),
		});

		for (const label of TOOLBAR_LABELS) {
			expect(screen.getByRole('button', { name: label })).not.toBeNull();
		}
	});

	it('H1 ボタンで見出し（h1）へ変換され onChange に反映される', () => {
		const onChange = vi.fn();
		render(<RichTextEditor content="<p>本文</p>" onChange={onChange} />, {
			wrapper: createWrapper(),
		});

		fireEvent.click(screen.getByRole('button', { name: 'H1' }));

		const lastHtml = onChange.mock.calls.at(-1)?.[0] as string | undefined;
		expect(lastHtml).toContain('<h1>');
	});

	it('箇条書きボタンで bullet list（ul）へ変換され onChange に反映される', () => {
		const onChange = vi.fn();
		render(<RichTextEditor content="<p>本文</p>" onChange={onChange} />, {
			wrapper: createWrapper(),
		});

		fireEvent.click(screen.getByRole('button', { name: '・リスト' }));

		const lastHtml = onChange.mock.calls.at(-1)?.[0] as string | undefined;
		expect(lastHtml).toContain('<ul>');
	});

	it('引用ボタンで blockquote へ変換され onChange に反映される', () => {
		const onChange = vi.fn();
		render(<RichTextEditor content="<p>本文</p>" onChange={onChange} />, {
			wrapper: createWrapper(),
		});

		fireEvent.click(screen.getByRole('button', { name: '引用' }));

		const lastHtml = onChange.mock.calls.at(-1)?.[0] as string | undefined;
		expect(lastHtml).toContain('<blockquote>');
	});
});

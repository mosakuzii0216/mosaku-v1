import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import { RichTextEditor } from './RichTextEditor';
import { useEditorFocusStore } from '../../stores/useEditorFocusStore';
import { createEmptyDoc } from '../../utils/editor/prosemirrorText';

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
		const { container } = render(
			<RichTextEditor content={createEmptyDoc()} onChange={() => {}} />,
			{
				wrapper: createWrapper(),
			},
		);

		const prosemirror = container.querySelector('.ProseMirror');
		expect(prosemirror).not.toBeNull();

		prosemirror!.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

		expect(useEditorFocusStore.getState().isEditorFocused).toBe(true);
	});

	it('エディタからブラーすると isEditorFocused が false になる', async () => {
		const { container } = render(
			<RichTextEditor content={createEmptyDoc()} onChange={() => {}} />,
			{
				wrapper: createWrapper(),
			},
		);

		const prosemirror = container.querySelector('.ProseMirror');

		prosemirror!.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
		expect(useEditorFocusStore.getState().isEditorFocused).toBe(true);

		prosemirror!.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
		expect(useEditorFocusStore.getState().isEditorFocused).toBe(false);
	});

	it('アンマウント時に isEditorFocused が false にリセットされる', () => {
		const { unmount } = render(<RichTextEditor content={createEmptyDoc()} onChange={() => {}} />, {
			wrapper: createWrapper(),
		});

		useEditorFocusStore.getState().setEditorFocused(true);
		expect(useEditorFocusStore.getState().isEditorFocused).toBe(true);

		unmount();

		expect(useEditorFocusStore.getState().isEditorFocused).toBe(false);
	});
});

describe('RichTextEditor - prose クラス保持（タイポグラフィ回帰ガード）', () => {
	beforeEach(() => {
		useEditorFocusStore.setState({ isEditorFocused: false });
		cleanup();
	});

	it('.ProseMirror 要素が prose クラスを持つ', () => {
		const { container } = render(
			<RichTextEditor content={createEmptyDoc()} onChange={() => {}} />,
			{
				wrapper: createWrapper(),
			},
		);
		const prosemirror = container.querySelector('.ProseMirror');
		expect(prosemirror?.className).toContain('prose');
	});

	it('.ProseMirror 要素がレスポンシブ prose クラスを持つ（prose-sm / prose-base / prose-lg / prose-xl）', () => {
		const { container } = render(
			<RichTextEditor content={createEmptyDoc()} onChange={() => {}} />,
			{
				wrapper: createWrapper(),
			},
		);
		const cls = container.querySelector('.ProseMirror')?.className ?? '';
		expect(cls).toContain('prose-sm');
		expect(cls).toContain('sm:prose-base');
		expect(cls).toContain('lg:prose-lg');
		expect(cls).toContain('xl:prose-xl');
	});
});

describe('RichTextEditor - ツールバー非回帰（共有ファクトリ移行後）', () => {
	beforeEach(() => {
		useEditorFocusStore.setState({ isEditorFocused: false });
		cleanup();
	});

	const TOOLBAR_LABELS = ['太字', '斜体', '取消線', 'H1', 'H2', '・リスト', '1.リスト', '引用'];

	it('従来のツールバーボタンがすべて存在する', () => {
		const initialContent: JSONContent = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文' }] }],
		};
		render(<RichTextEditor content={initialContent} onChange={() => {}} />, {
			wrapper: createWrapper(),
		});

		for (const label of TOOLBAR_LABELS) {
			expect(screen.getByRole('button', { name: label })).not.toBeNull();
		}
	});

	it('H1 ボタンで見出し（h1）へ変換され onChange に JSONContent を通知する', () => {
		const onChange = vi.fn();
		const initialContent: JSONContent = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文' }] }],
		};
		render(<RichTextEditor content={initialContent} onChange={onChange} />, {
			wrapper: createWrapper(),
		});

		fireEvent.click(screen.getByRole('button', { name: 'H1' }));

		const lastJson = onChange.mock.calls.at(-1)?.[0] as JSONContent | undefined;
		// JSON 形式で通知されており、type='doc' であること
		expect(lastJson?.type).toBe('doc');
		// 見出しノードが含まれること
		const hasHeading = lastJson?.content?.some((n) => n.type === 'heading');
		expect(hasHeading).toBe(true);
	});

	it('箇条書きボタンで bulletList へ変換され onChange に JSONContent を通知する', () => {
		const onChange = vi.fn();
		const initialContent: JSONContent = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文' }] }],
		};
		render(<RichTextEditor content={initialContent} onChange={onChange} />, {
			wrapper: createWrapper(),
		});

		fireEvent.click(screen.getByRole('button', { name: '・リスト' }));

		const lastJson = onChange.mock.calls.at(-1)?.[0] as JSONContent | undefined;
		expect(lastJson?.type).toBe('doc');
		const hasBulletList = lastJson?.content?.some((n) => n.type === 'bulletList');
		expect(hasBulletList).toBe(true);
	});

	it('引用ボタンで blockquote へ変換され onChange に JSONContent を通知する', () => {
		const onChange = vi.fn();
		const initialContent: JSONContent = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文' }] }],
		};
		render(<RichTextEditor content={initialContent} onChange={onChange} />, {
			wrapper: createWrapper(),
		});

		fireEvent.click(screen.getByRole('button', { name: '引用' }));

		const lastJson = onChange.mock.calls.at(-1)?.[0] as JSONContent | undefined;
		expect(lastJson?.type).toBe('doc');
		const hasBlockquote = lastJson?.content?.some((n) => n.type === 'blockquote');
		expect(hasBlockquote).toBe(true);
	});
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useState } from 'react';
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

	it('.ProseMirror 要素は固定の暗文字クラス text-gray-900 を持たない（Prose Bridge が親から色を継承するため・4.1）', () => {
		const { container } = render(
			<RichTextEditor content={createEmptyDoc()} onChange={() => {}} />,
			{
				wrapper: createWrapper(),
			},
		);
		const cls = container.querySelector('.ProseMirror')?.className ?? '';
		expect(cls).not.toContain('text-gray-900');
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

describe('RichTextEditor — ツールバーのトークン駆動化（editor-surface-tokenization 5.2）', () => {
	beforeEach(() => {
		useEditorFocusStore.setState({ isEditorFocused: false });
		cleanup();
	});

	const TOOLBAR_LABELS = ['太字', '斜体', '取消線', 'H1', 'H2', '・リスト', '1.リスト', '引用'];

	it('ツールバー8ボタンが .shell-button と aria-pressed を持つ（2.1-2.4）', () => {
		render(<RichTextEditor content={createEmptyDoc()} onChange={() => {}} />, {
			wrapper: createWrapper(),
		});

		for (const label of TOOLBAR_LABELS) {
			const button = screen.getByRole('button', { name: label });
			expect(button.classList.contains('shell-button')).toBe(true);
			expect(button.getAttribute('aria-pressed')).not.toBeNull();
		}
	});

	it('H1 ボタンを押下すると aria-pressed が true になる（onChange で親が再レンダリングする実運用と同型）', () => {
		// H1 は collapsed selection でもブロック型を変える＝ doc が必ず変化し onUpdate が発火する
		// （太字はテキスト選択が無いと storedMarks のみ変わり doc は不変のため onUpdate が発火せず、
		// この検証には使えない）。
		function StatefulHarness({ initialContent }: { initialContent: JSONContent }) {
			const [content, setContent] = useState(initialContent);
			return <RichTextEditor content={content} onChange={setContent} />;
		}

		const initialContent: JSONContent = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文' }] }],
		};
		render(<StatefulHarness initialContent={initialContent} />, {
			wrapper: createWrapper(),
		});

		const h1 = screen.getByRole('button', { name: 'H1' });
		expect(h1.getAttribute('aria-pressed')).toBe('false');

		fireEvent.click(h1);

		expect(h1.getAttribute('aria-pressed')).toBe('true');
	});

	it('ツールバーボタンは生 Tailwind 配色（bg-white / bg-blue-500 / text-gray-700 等）を直当てしない', () => {
		render(<RichTextEditor content={createEmptyDoc()} onChange={() => {}} />, {
			wrapper: createWrapper(),
		});

		for (const label of TOOLBAR_LABELS) {
			const button = screen.getByRole('button', { name: label });
			expect(button.className).not.toMatch(
				/bg-white|bg-blue-\d|text-gray-\d|border-gray-\d|disabled:opacity/,
			);
		}
	});
});

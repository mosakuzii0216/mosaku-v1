import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
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

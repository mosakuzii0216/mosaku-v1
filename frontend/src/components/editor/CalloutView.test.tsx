import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import { RichTextEditor } from './RichTextEditor';
import { PublicMemoRenderer } from '../public/PublicMemoRenderer';

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

const calloutDoc: JSONContent = {
	type: 'doc',
	content: [
		{
			type: 'callout',
			attrs: { variant: 'point' },
			content: [{ type: 'paragraph', content: [{ type: 'text', text: '大事な内容' }] }],
		},
	],
};

/**
 * CalloutView（NodeView, Task 4.2）。
 * ReactNodeViewRenderer は `editor.contentComponent`（@tiptap/react の Portal 基盤）を
 * 要求するため、実際に RichTextEditor/PublicMemoRenderer をレンダリングして検証する
 * （ヘッドレス Editor では NodeView が描画されず {} を返すのみになる）。
 */
describe('CalloutView（NodeView, Task 4.2）', () => {
	it('本文（NodeViewContent）のテキストが表示される', async () => {
		render(<RichTextEditor content={calloutDoc} onChange={() => {}} />, {
			wrapper: createWrapper(),
		});
		await waitFor(() => {
			expect(screen.getByText('大事な内容')).toBeTruthy();
		});
	});

	it('種別セレクトで variant を変更すると本文を保持したまま attrs.variant のみ切り替わる（Req1.3）', async () => {
		const onChange = vi.fn();
		render(<RichTextEditor content={calloutDoc} onChange={onChange} />, {
			wrapper: createWrapper(),
		});

		const select = await waitFor(
			() => screen.getByLabelText('コールアウト種別') as HTMLSelectElement,
		);
		fireEvent.change(select, { target: { value: 'warning' } });

		await waitFor(() => {
			const lastCall = onChange.mock.calls.at(-1)?.[0] as JSONContent;
			const callout = lastCall.content?.find((n) => n.type === 'callout');
			expect(callout?.attrs?.variant).toBe('warning');
			expect(callout?.content?.[0]?.content?.[0]?.text).toBe('大事な内容');
		});
	});

	it('削除ボタンでコールアウトを本文ごと削除する（Req1.6）', async () => {
		const onChange = vi.fn();
		render(<RichTextEditor content={calloutDoc} onChange={onChange} />, {
			wrapper: createWrapper(),
		});

		const deleteButton = await waitFor(() => screen.getByLabelText('コールアウトを削除'));
		fireEvent.click(deleteButton);

		await waitFor(() => {
			const lastCall = onChange.mock.calls.at(-1)?.[0] as JSONContent;
			expect(lastCall.content?.some((n) => n.type === 'callout')).toBe(false);
			expect(JSON.stringify(lastCall)).not.toContain('大事な内容');
		});
	});

	it('公開ビュー（editable:false）では操作 UI を描画せず本文のみ表示する（Req6.4）', async () => {
		render(<PublicMemoRenderer content={calloutDoc} />);

		await waitFor(() => {
			expect(screen.getByText('大事な内容')).toBeTruthy();
		});
		expect(screen.queryByLabelText('コールアウト種別')).toBeNull();
		expect(screen.queryByLabelText('コールアウトを削除')).toBeNull();
	});
});

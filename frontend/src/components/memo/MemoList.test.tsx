import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/*
 * MemoList.test.tsx — メモ一覧のトークン駆動化（theme-immersive-world / Task 4.3）
 * ===========================================================================
 * 何を守るテストか:
 *   メモ一覧は玄関の中心面。本タスクは見出し・件数・検索入力・主要ボタンを生 Tailwind 配色
 *   からセマンティックトークン＋プリミティブ（.shell-field / .shell-button-primary）へ置換する。
 *   よって「(a) 見出し/補助テキストが on-surface 系トークンで解決し生 text-gray-* を持たない、
 *   (b) 検索入力・主要ボタンがプリミティブクラスになる、(c) 件数等の補助テキストが消えない」を
 *   機械検証する（1.2, 2.1, 3.4, 4.x）。
 */

vi.mock('../../hooks/useMemoQueries', () => ({
	useMemos: vi.fn(),
	useSearchMemos: vi.fn(),
	useTogglePin: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock('../../stores/useViewStore', () => ({
	useViewStore: vi.fn(() => ({ notebookFilter: 'ALL' })),
}));

vi.mock('../../hooks/useNavigation', () => ({
	useNavigation: vi.fn(() => ({ goToEdit: vi.fn(), goToMemoCreate: vi.fn() })),
}));

vi.mock('./MemoItem', () => ({
	MemoItem: ({ memo }: { memo: { title: string } }) => (
		<div data-testid="memo-item">{memo.title}</div>
	),
}));

import { MemoList } from './MemoList';
import { useMemos, useSearchMemos, useTogglePin } from '../../hooks/useMemoQueries';

const mockMemos = [
	{
		id: '1',
		title: 'テストメモ',
		content: '<p>本文</p>',
		notebookId: null,
		createdAt: '2026-06-28T00:00:00.000Z',
		updatedAt: '2026-06-28T00:00:00.000Z',
	},
];

describe('MemoList — メモ一覧のトークン駆動化（4.3）', () => {
	beforeEach(() => {
		vi.mocked(useMemos).mockReturnValue({
			data: mockMemos,
			isLoading: false,
			error: null,
		} as ReturnType<typeof useMemos>);
		vi.mocked(useSearchMemos).mockReturnValue({
			data: [],
			isLoading: false,
			error: null,
		} as ReturnType<typeof useSearchMemos>);
	});

	it('一覧の見出しは on-surface トークンで解決し、生 text-gray-900 を持たない', () => {
		render(<MemoList />);
		const heading = screen.getByText('全メモ');
		expect(heading.className).toMatch(/var\(--on-surface\)/);
		expect(heading.className).not.toMatch(/text-gray-900/);
	});

	it('件数の補助テキストは on-surface-variant で判読下限を保つ（3.4）', () => {
		render(<MemoList />);
		const count = screen.getByText('1 件');
		expect(count.className).toMatch(/var\(--on-surface-variant\)/);
	});

	it('検索入力は .shell-field（トークン駆動）になる', () => {
		render(<MemoList />);
		const input = screen.getByPlaceholderText('タイトル・本文で検索...');
		expect(input.classList.contains('shell-field')).toBe(true);
	});

	it('新規メモボタンは .shell-button-primary（accent×on-accent）になる', () => {
		render(<MemoList />);
		const btn = screen.getByText('新規メモ').closest('button');
		expect(btn?.classList.contains('shell-button-primary')).toBe(true);
	});

	it('主要ボタンは生 Tailwind 配色（bg-blue-500）を直当てしない', () => {
		render(<MemoList />);
		const btn = screen.getByText('新規メモ').closest('button');
		expect(btn?.className).not.toMatch(/bg-blue-500/);
	});
});

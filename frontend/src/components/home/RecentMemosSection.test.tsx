import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

const mockGoToMemoEditById = vi.fn();
const mockGoToMemoCreate = vi.fn();
const mockRefetch = vi.fn();

vi.mock('../../hooks/useNavigation', () => ({
	useNavigation: vi.fn(() => ({
		goToMemoEditById: mockGoToMemoEditById,
		goToMemoCreate: mockGoToMemoCreate,
	})),
}));

vi.mock('../../hooks/useHomeDashboardQueries', () => ({
	useRecentMemos: vi.fn(),
}));

import { useRecentMemos } from '../../hooks/useHomeDashboardQueries';
import { RecentMemosSection } from './RecentMemosSection';

describe('RecentMemosSection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ローディング中はスケルトンカードを3枚表示する', () => {
		vi.mocked(useRecentMemos).mockReturnValue({
			isLoading: true,
			isError: false,
			data: undefined,
			refetch: mockRefetch,
		} as ReturnType<typeof useRecentMemos>);

		const { getAllByTestId } = render(<RecentMemosSection />);
		expect(getAllByTestId('skeleton-card')).toHaveLength(3);
	});

	it('エラー時はエラーメッセージと再試行ボタンを表示する', () => {
		vi.mocked(useRecentMemos).mockReturnValue({
			isLoading: false,
			isError: true,
			data: undefined,
			refetch: mockRefetch,
		} as ReturnType<typeof useRecentMemos>);

		const { getByText, getByRole } = render(<RecentMemosSection />);
		expect(getByText(/データを取得できませんでした/)).toBeTruthy();
		expect(getByRole('button', { name: /再試行/ })).toBeTruthy();
	});

	it('エラー時の再試行ボタンクリックで refetch を呼び出す', () => {
		vi.mocked(useRecentMemos).mockReturnValue({
			isLoading: false,
			isError: true,
			data: undefined,
			refetch: mockRefetch,
		} as ReturnType<typeof useRecentMemos>);

		const { getByRole } = render(<RecentMemosSection />);
		fireEvent.click(getByRole('button', { name: /再試行/ }));
		expect(mockRefetch).toHaveBeenCalledTimes(1);
	});

	it('0件時は空状態メッセージと新規作成ボタンを表示する', () => {
		vi.mocked(useRecentMemos).mockReturnValue({
			isLoading: false,
			isError: false,
			data: [],
			refetch: mockRefetch,
		} as ReturnType<typeof useRecentMemos>);

		const { getByText } = render(<RecentMemosSection />);
		expect(getByText(/まだメモがありません/)).toBeTruthy();
	});

	it('メモカードを表示する', () => {
		vi.mocked(useRecentMemos).mockReturnValue({
			isLoading: false,
			isError: false,
			data: [
				{
					id: '1',
					title: 'テストメモ',
					contentPreview: '本文プレビュー',
					updatedAt: '2026-06-01T00:00:00Z',
				},
			],
			refetch: mockRefetch,
		} as ReturnType<typeof useRecentMemos>);

		const { getByText } = render(<RecentMemosSection />);
		expect(getByText('テストメモ')).toBeTruthy();
	});

	it('カードクリックで goToMemoEditById を呼び出す', () => {
		vi.mocked(useRecentMemos).mockReturnValue({
			isLoading: false,
			isError: false,
			data: [
				{
					id: 'memo-1',
					title: 'メモ1',
					contentPreview: 'プレビュー',
					updatedAt: '2026-06-01T00:00:00Z',
				},
			],
			refetch: mockRefetch,
		} as ReturnType<typeof useRecentMemos>);

		const { getByText } = render(<RecentMemosSection />);
		fireEvent.click(getByText('メモ1'));
		expect(mockGoToMemoEditById).toHaveBeenCalledWith('memo-1');
	});
});

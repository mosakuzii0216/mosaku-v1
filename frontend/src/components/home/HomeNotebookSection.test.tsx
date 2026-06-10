import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

const mockGoToMemosForNotebook = vi.fn();
const mockGoToNotebookCreate = vi.fn();
const mockRefetch = vi.fn();

vi.mock('../../hooks/useNavigation', () => ({
	useNavigation: vi.fn(() => ({
		goToMemosForNotebook: mockGoToMemosForNotebook,
		goToNotebookCreate: mockGoToNotebookCreate,
	})),
}));

vi.mock('../../hooks/useHomeDashboardQueries', () => ({
	useHomeDashboardNotebooks: vi.fn(),
}));

import { useHomeDashboardNotebooks } from '../../hooks/useHomeDashboardQueries';
import { HomeNotebookSection } from './HomeNotebookSection';

describe('HomeNotebookSection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ローディング中はスケルトンを表示する', () => {
		vi.mocked(useHomeDashboardNotebooks).mockReturnValue({
			isLoading: true,
			isError: false,
			data: undefined,
			refetch: mockRefetch,
		} as ReturnType<typeof useHomeDashboardNotebooks>);

		const { getByTestId } = render(<HomeNotebookSection />);
		expect(getByTestId('notebooks-skeleton')).toBeTruthy();
	});

	it('エラー時はエラーメッセージと再試行ボタンを表示する', () => {
		vi.mocked(useHomeDashboardNotebooks).mockReturnValue({
			isLoading: false,
			isError: true,
			data: undefined,
			refetch: mockRefetch,
		} as ReturnType<typeof useHomeDashboardNotebooks>);

		const { getByText, getByRole } = render(<HomeNotebookSection />);
		expect(getByText(/データを取得できませんでした/)).toBeTruthy();
		expect(getByRole('button', { name: /再試行/ })).toBeTruthy();
	});

	it('0件時はノートブックなしメッセージと作成ボタンを表示する', () => {
		vi.mocked(useHomeDashboardNotebooks).mockReturnValue({
			isLoading: false,
			isError: false,
			data: [],
			refetch: mockRefetch,
		} as ReturnType<typeof useHomeDashboardNotebooks>);

		const { getByText } = render(<HomeNotebookSection />);
		expect(getByText(/ノートブックがありません/)).toBeTruthy();
	});

	it('ノートブック一覧を表示する', () => {
		vi.mocked(useHomeDashboardNotebooks).mockReturnValue({
			isLoading: false,
			isError: false,
			data: [
				{ id: 'nb-1', name: '仕事メモ', memoCount: 10 },
				{ id: 'nb-2', name: '読書ノート', memoCount: 5 },
			],
			refetch: mockRefetch,
		} as ReturnType<typeof useHomeDashboardNotebooks>);

		const { getByText } = render(<HomeNotebookSection />);
		expect(getByText('仕事メモ')).toBeTruthy();
		expect(getByText('読書ノート')).toBeTruthy();
	});

	it('ノートブック件数を表示する', () => {
		vi.mocked(useHomeDashboardNotebooks).mockReturnValue({
			isLoading: false,
			isError: false,
			data: [{ id: 'nb-1', name: '仕事メモ', memoCount: 10 }],
			refetch: mockRefetch,
		} as ReturnType<typeof useHomeDashboardNotebooks>);

		const { getByText } = render(<HomeNotebookSection />);
		expect(getByText(/10/)).toBeTruthy();
	});

	it('ノートブック行クリックで goToMemosForNotebook を呼び出す', () => {
		vi.mocked(useHomeDashboardNotebooks).mockReturnValue({
			isLoading: false,
			isError: false,
			data: [{ id: 'nb-1', name: '仕事メモ', memoCount: 3 }],
			refetch: mockRefetch,
		} as ReturnType<typeof useHomeDashboardNotebooks>);

		const { getByText } = render(<HomeNotebookSection />);
		fireEvent.click(getByText('仕事メモ'));
		expect(mockGoToMemosForNotebook).toHaveBeenCalledWith('nb-1');
	});
});

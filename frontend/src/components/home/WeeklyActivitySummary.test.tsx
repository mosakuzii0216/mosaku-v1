import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

const mockRefetch = vi.fn();

vi.mock('../../hooks/useHomeDashboardQueries', () => ({
	useWeeklyMemoCount: vi.fn(),
}));

import { useWeeklyMemoCount } from '../../hooks/useHomeDashboardQueries';
import { WeeklyActivitySummary } from './WeeklyActivitySummary';

describe('WeeklyActivitySummary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ローディング中はスケルトンを表示する', () => {
		vi.mocked(useWeeklyMemoCount).mockReturnValue({
			isLoading: true,
			isError: false,
			data: undefined,
			refetch: mockRefetch,
		} as ReturnType<typeof useWeeklyMemoCount>);

		const { getByTestId } = render(<WeeklyActivitySummary />);
		expect(getByTestId('weekly-count-skeleton')).toBeTruthy();
	});

	it('件数が1以上のとき「今週 N個 書いたよ」を表示する', () => {
		vi.mocked(useWeeklyMemoCount).mockReturnValue({
			isLoading: false,
			isError: false,
			data: { count: 5, weekStart: '2026-06-02', weekEnd: '2026-06-08' },
			refetch: mockRefetch,
		} as ReturnType<typeof useWeeklyMemoCount>);

		const { getByText } = render(<WeeklyActivitySummary />);
		expect(getByText(/今週 5個 書いたよ/)).toBeTruthy();
	});

	it('0件のとき強制感のない文言を表示する', () => {
		vi.mocked(useWeeklyMemoCount).mockReturnValue({
			isLoading: false,
			isError: false,
			data: { count: 0, weekStart: '2026-06-02', weekEnd: '2026-06-08' },
			refetch: mockRefetch,
		} as ReturnType<typeof useWeeklyMemoCount>);

		const { getByText } = render(<WeeklyActivitySummary />);
		expect(getByText(/今週はまだ書いていないよ/)).toBeTruthy();
	});

	it('エラー時はエラーメッセージと再試行ボタンを表示する', () => {
		vi.mocked(useWeeklyMemoCount).mockReturnValue({
			isLoading: false,
			isError: true,
			data: undefined,
			refetch: mockRefetch,
		} as ReturnType<typeof useWeeklyMemoCount>);

		const { getByText, getByRole } = render(<WeeklyActivitySummary />);
		expect(getByText(/データを取得できませんでした/)).toBeTruthy();
		expect(getByRole('button', { name: /再試行/ })).toBeTruthy();
	});

	it('再試行ボタンクリックで refetch を呼び出す', () => {
		vi.mocked(useWeeklyMemoCount).mockReturnValue({
			isLoading: false,
			isError: true,
			data: undefined,
			refetch: mockRefetch,
		} as ReturnType<typeof useWeeklyMemoCount>);

		const { getByRole } = render(<WeeklyActivitySummary />);
		fireEvent.click(getByRole('button', { name: /再試行/ }));
		expect(mockRefetch).toHaveBeenCalledTimes(1);
	});
});

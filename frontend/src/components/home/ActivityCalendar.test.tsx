import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

const mockRefetch = vi.fn();

vi.mock('../../hooks/useHomeDashboardQueries', () => ({
	useActivityDates: vi.fn(),
}));

import { useActivityDates } from '../../hooks/useHomeDashboardQueries';
import { ActivityCalendar } from './ActivityCalendar';

describe('ActivityCalendar', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ローディング中はグリッドスケルトンを表示する', () => {
		vi.mocked(useActivityDates).mockReturnValue({
			isLoading: true,
			isError: false,
			data: undefined,
			refetch: mockRefetch,
		} as ReturnType<typeof useActivityDates>);

		const { getByTestId } = render(<ActivityCalendar />);
		expect(getByTestId('activity-calendar-skeleton')).toBeTruthy();
	});

	it('エラー時はエラーメッセージと再試行ボタンを表示する', () => {
		vi.mocked(useActivityDates).mockReturnValue({
			isLoading: false,
			isError: true,
			data: undefined,
			refetch: mockRefetch,
		} as ReturnType<typeof useActivityDates>);

		const { getByText, getByRole } = render(<ActivityCalendar />);
		expect(getByText(/データを取得できませんでした/)).toBeTruthy();
		expect(getByRole('button', { name: /再試行/ })).toBeTruthy();
	});

	it('再試行ボタンクリックで refetch を呼び出す', () => {
		vi.mocked(useActivityDates).mockReturnValue({
			isLoading: false,
			isError: true,
			data: undefined,
			refetch: mockRefetch,
		} as ReturnType<typeof useActivityDates>);

		const { getByRole } = render(<ActivityCalendar />);
		fireEvent.click(getByRole('button', { name: /再試行/ }));
		expect(mockRefetch).toHaveBeenCalledTimes(1);
	});

	it('35個のグリッドセルを表示する', () => {
		vi.mocked(useActivityDates).mockReturnValue({
			isLoading: false,
			isError: false,
			data: { dates: [] },
			refetch: mockRefetch,
		} as ReturnType<typeof useActivityDates>);

		const { getAllByTestId } = render(<ActivityCalendar />);
		expect(getAllByTestId('calendar-cell')).toHaveLength(35);
	});

	it('アクティブ日のセルにドットを表示する', () => {
		const today = new Date();
		const todayStr = today.toISOString().split('T')[0];

		vi.mocked(useActivityDates).mockReturnValue({
			isLoading: false,
			isError: false,
			data: { dates: [todayStr] },
			refetch: mockRefetch,
		} as ReturnType<typeof useActivityDates>);

		const { getAllByTestId } = render(<ActivityCalendar />);
		const activeDots = getAllByTestId('active-dot');
		expect(activeDots.length).toBeGreaterThan(0);
	});
});

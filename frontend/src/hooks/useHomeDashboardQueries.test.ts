import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';

const getDashboardRecentMemosMock = vi.fn();
const getDashboardWeeklyCountMock = vi.fn();
const getDashboardActivityDatesMock = vi.fn();
const getDashboardNotebooksMock = vi.fn();

vi.mock('../utils/api', () => ({
	apiClient: {
		getDashboardRecentMemos: (...args: unknown[]) => getDashboardRecentMemosMock(...args),
		getDashboardWeeklyCount: (...args: unknown[]) => getDashboardWeeklyCountMock(...args),
		getDashboardActivityDates: (...args: unknown[]) => getDashboardActivityDatesMock(...args),
		getDashboardNotebooks: (...args: unknown[]) => getDashboardNotebooksMock(...args),
	},
}));

import {
	useRecentMemos,
	useWeeklyMemoCount,
	useActivityDates,
	useHomeDashboardNotebooks,
} from './useHomeDashboardQueries';

function makeWrapper(): { wrapper: (props: { children: ReactNode }) => React.JSX.Element } {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	});
	const wrapper = ({ children }: { children: ReactNode }) =>
		React.createElement(QueryClientProvider, { client }, children);
	return { wrapper };
}

describe('useRecentMemos', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('正しいエンドポイントを呼び出してデータを返す', async () => {
		const mockData = [
			{
				id: '1',
				title: 'テストメモ',
				contentPreview: '本文冒頭',
				updatedAt: '2026-06-09T00:00:00Z',
			},
		];
		getDashboardRecentMemosMock.mockResolvedValue(mockData);
		const { wrapper } = makeWrapper();

		const { result } = renderHook(() => useRecentMemos(), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(getDashboardRecentMemosMock).toHaveBeenCalledTimes(1);
		expect(result.current.data).toEqual(mockData);
	});

	it('エラー時に isError が true になる', async () => {
		getDashboardRecentMemosMock.mockRejectedValue(new Error('Network error'));
		const { wrapper } = makeWrapper();

		const { result } = renderHook(() => useRecentMemos(), { wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});
});

describe('useWeeklyMemoCount', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('正しいエンドポイントを呼び出してデータを返す', async () => {
		const mockData = { count: 5, weekStart: '2026-06-08', weekEnd: '2026-06-14' };
		getDashboardWeeklyCountMock.mockResolvedValue(mockData);
		const { wrapper } = makeWrapper();

		const { result } = renderHook(() => useWeeklyMemoCount(), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(getDashboardWeeklyCountMock).toHaveBeenCalledTimes(1);
		expect(result.current.data).toEqual(mockData);
	});

	it('エラー時に isError が true になる', async () => {
		getDashboardWeeklyCountMock.mockRejectedValue(new Error('Network error'));
		const { wrapper } = makeWrapper();

		const { result } = renderHook(() => useWeeklyMemoCount(), { wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});
});

describe('useActivityDates', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('from/to を引数として正しいエンドポイントを呼び出す', async () => {
		const mockData = { dates: ['2026-06-01', '2026-06-05', '2026-06-09'] };
		getDashboardActivityDatesMock.mockResolvedValue(mockData);
		const { wrapper } = makeWrapper();

		const { result } = renderHook(() => useActivityDates('2026-05-06', '2026-06-09'), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(getDashboardActivityDatesMock).toHaveBeenCalledWith('2026-05-06', '2026-06-09');
		expect(result.current.data).toEqual(mockData);
	});

	it('エラー時に isError が true になる', async () => {
		getDashboardActivityDatesMock.mockRejectedValue(new Error('Network error'));
		const { wrapper } = makeWrapper();

		const { result } = renderHook(() => useActivityDates('2026-05-06', '2026-06-09'), { wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});
});

describe('useHomeDashboardNotebooks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('正しいエンドポイントを呼び出してデータを返す', async () => {
		const mockData = [
			{ id: 'nb1', name: 'ノートブック1', memoCount: 3 },
			{ id: 'nb2', name: null, memoCount: 0 },
		];
		getDashboardNotebooksMock.mockResolvedValue(mockData);
		const { wrapper } = makeWrapper();

		const { result } = renderHook(() => useHomeDashboardNotebooks(), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(getDashboardNotebooksMock).toHaveBeenCalledTimes(1);
		expect(result.current.data).toEqual(mockData);
	});

	it('エラー時に isError が true になる', async () => {
		getDashboardNotebooksMock.mockRejectedValue(new Error('Network error'));
		const { wrapper } = makeWrapper();

		const { result } = renderHook(() => useHomeDashboardNotebooks(), { wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMemoDataStore } from '../stores/useMemoDataStore';

const mockThemeA = {
	id: 'theme-a',
	name: 'Theme A',
	cssFilePath: 'mori/mori.css',
	styles: undefined,
};

const mockThemeB = {
	id: 'theme-b',
	name: 'Theme B',
	cssFilePath: 'kami/kami.css',
	styles: undefined,
};

vi.mock('./useNotebookQueries', () => ({
	useNotebooks: vi.fn(() => ({ data: [] })),
}));

vi.mock('./useMemoQueries', () => ({
	useMemo: vi.fn(() => ({ data: undefined })),
}));

import { useNotebooks } from './useNotebookQueries';
import { useMemo as useMemoQuery } from './useMemoQueries';
import { useActiveTheme } from './useActiveTheme';

describe('useActiveTheme', () => {
	beforeEach(() => {
		useMemoDataStore.setState({
			selectedMemoId: null,
			selectedNotebookId: null,
		});
		vi.mocked(useNotebooks).mockReturnValue({ data: [] } as unknown as ReturnType<
			typeof useNotebooks
		>);
		vi.mocked(useMemoQuery).mockReturnValue({
			data: undefined,
		} as unknown as ReturnType<typeof useMemoQuery>);
	});

	it('メモもノートブックも未選択の場合、null を返す', () => {
		const { result } = renderHook(() => useActiveTheme());
		expect(result.current).toBeNull();
	});

	it('選択ノートブックにテーマがある場合、そのテーマを返す', () => {
		useMemoDataStore.setState({ selectedNotebookId: 'nb-1' });
		vi.mocked(useNotebooks).mockReturnValue({
			data: [{ id: 'nb-1', name: 'NB', theme: mockThemeA }],
		} as ReturnType<typeof useNotebooks>);

		const { result } = renderHook(() => useActiveTheme());
		expect(result.current).toEqual(mockThemeA);
	});

	it('選択ノートブックにテーマがなく、メモのノートブックにテーマがある場合、メモのテーマを返す', () => {
		useMemoDataStore.setState({ selectedMemoId: 'memo-1', selectedNotebookId: 'nb-1' });
		vi.mocked(useNotebooks).mockReturnValue({
			data: [{ id: 'nb-1', name: 'NB', theme: null }],
		} as ReturnType<typeof useNotebooks>);
		vi.mocked(useMemoQuery).mockReturnValue({
			data: {
				id: 'memo-1',
				title: 'Test',
				content: '',
				createdAt: '',
				updatedAt: '',
				trashedAt: null,
				notebook: { id: 'nb-2', name: 'NB2', theme: mockThemeB },
			},
		} as ReturnType<typeof useMemoQuery>);

		const { result } = renderHook(() => useActiveTheme());
		expect(result.current).toEqual(mockThemeB);
	});

	it('選択ノートブックのテーマがメモのノートブックテーマより優先される', () => {
		useMemoDataStore.setState({ selectedMemoId: 'memo-1', selectedNotebookId: 'nb-1' });
		vi.mocked(useNotebooks).mockReturnValue({
			data: [{ id: 'nb-1', name: 'NB', theme: mockThemeA }],
		} as ReturnType<typeof useNotebooks>);
		vi.mocked(useMemoQuery).mockReturnValue({
			data: {
				id: 'memo-1',
				title: 'Test',
				content: '',
				createdAt: '',
				updatedAt: '',
				trashedAt: null,
				notebook: { id: 'nb-2', name: 'NB2', theme: mockThemeB },
			},
		} as ReturnType<typeof useMemoQuery>);

		const { result } = renderHook(() => useActiveTheme());
		expect(result.current).toEqual(mockThemeA);
	});
});

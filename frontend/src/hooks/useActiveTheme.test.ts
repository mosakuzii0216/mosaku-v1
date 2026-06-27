import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMemoDataStore } from '../stores/useMemoDataStore';
import { useShellThemeStore } from '../stores/useShellThemeStore';

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

const mockShellTheme = {
	id: 'shell-theme',
	name: 'Shell Mori',
	cssFilePath: 'mori/mori.css',
	styles: undefined,
	metadata: { effectKey: 'mori' },
};

vi.mock('./useNotebookQueries', () => ({
	useNotebooks: vi.fn(() => ({ data: [] })),
}));

vi.mock('./useMemoQueries', () => ({
	useMemo: vi.fn(() => ({ data: undefined })),
}));

vi.mock('./useThemeQueries', () => ({
	useThemes: vi.fn(() => ({ data: [] })),
}));

import { useNotebooks } from './useNotebookQueries';
import { useMemo as useMemoQuery } from './useMemoQueries';
import { useThemes } from './useThemeQueries';
import { useActiveTheme } from './useActiveTheme';

describe('useActiveTheme', () => {
	beforeEach(() => {
		useMemoDataStore.setState({
			selectedMemoId: null,
			selectedNotebookId: null,
		});
		useShellThemeStore.setState({ selection: null });
		vi.mocked(useNotebooks).mockReturnValue({ data: [] } as unknown as ReturnType<
			typeof useNotebooks
		>);
		vi.mocked(useMemoQuery).mockReturnValue({
			data: undefined,
		} as unknown as ReturnType<typeof useMemoQuery>);
		vi.mocked(useThemes).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useThemes>);
	});

	describe('文脈テーマ（ノートブック/メモ）— 既存挙動の温存', () => {
		it('メモもノートブックもシェル床も未選択の場合、null を返す', () => {
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

	describe('シェル床（localStorage 永続）— 文脈が無いときの「開いた瞬間に森」（2.1）', () => {
		it('文脈テーマが無くシェル床があり、キャッシュに Theme があればそれを返す', () => {
			useShellThemeStore.setState({ selection: { id: 'shell-theme', slug: 'mori' } });
			vi.mocked(useThemes).mockReturnValue({
				data: [mockShellTheme],
			} as unknown as ReturnType<typeof useThemes>);

			const { result } = renderHook(() => useActiveTheme());
			expect(result.current).toEqual(mockShellTheme);
		});

		it('キャッシュ未充足でも slug 由来の最小テーマを返し、CSS/エフェクト解決を途切れさせない（1.5）', () => {
			useShellThemeStore.setState({ selection: { id: 'shell-theme', slug: 'mori' } });
			vi.mocked(useThemes).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useThemes>);

			const { result } = renderHook(() => useActiveTheme());
			expect(result.current).not.toBeNull();
			expect(result.current?.id).toBe('shell-theme');
			// 非 null の時 metadata.effectKey が解決可能（ThemeEffectHost が機能する）= 不変則
			expect(result.current?.metadata?.effectKey).toBe('mori');
		});

		it('文脈テーマがシェル床より優先される（notebookContextTheme ?? shellTheme）', () => {
			useMemoDataStore.setState({ selectedNotebookId: 'nb-1' });
			vi.mocked(useNotebooks).mockReturnValue({
				data: [{ id: 'nb-1', name: 'NB', theme: mockThemeA }],
			} as ReturnType<typeof useNotebooks>);
			useShellThemeStore.setState({ selection: { id: 'shell-theme', slug: 'mori' } });
			vi.mocked(useThemes).mockReturnValue({
				data: [mockShellTheme],
			} as unknown as ReturnType<typeof useThemes>);

			const { result } = renderHook(() => useActiveTheme());
			expect(result.current).toEqual(mockThemeA);
		});
	});
});

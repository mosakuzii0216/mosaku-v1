import React, { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { queryKeys } from '../constants/queryKeys';
import type { Theme } from '../types/theme';

vi.mock('../utils/api', () => ({
	apiClient: {
		getThemes: vi.fn(),
		getSystemThemes: vi.fn(),
		getPublicThemes: vi.fn(),
		getThemesByCategory: vi.fn(),
		getTheme: vi.fn(),
		getFavoriteThemes: vi.fn(),
		createTheme: vi.fn(),
		updateTheme: vi.fn(),
		deleteTheme: vi.fn(),
		addToFavoriteThemes: vi.fn(),
		removeFromFavoriteThemes: vi.fn(),
	},
}));

vi.mock('../utils/logger', () => ({
	logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { apiClient } from '../utils/api';
import { logger } from '../utils/logger';
import {
	useThemes,
	useSystemThemes,
	usePublicThemes,
	useThemesByCategory,
	useTheme,
	useFavoriteThemes,
	useCreateTheme,
	useUpdateTheme,
	useDeleteTheme,
	useAddToFavoriteThemes,
	useRemoveFromFavoriteThemes,
} from './useThemeQueries';

const buildTheme = (overrides: Partial<Theme> = {}): Theme => ({
	id: 'theme-1',
	name: 'Mori',
	description: null,
	isSystem: true,
	isPublic: true,
	cssFilePath: 'mori/mori.css',
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: '2026-08-01T00:00:00.000Z',
	createdById: null,
	favoriteCount: 3,
	usageCount: 10,
	...overrides,
});

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
	<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
	vi.clearAllMocks();
	queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false, gcTime: Infinity },
			mutations: { retry: false },
		},
	});
});

// ─── クエリ系: queryKey と apiClient 呼び出し ──────────────────────────────────

describe('クエリ系フック', () => {
	it('useThemes は params を queryKey に含めて getThemes へ渡す', async () => {
		const themes = [buildTheme()];
		const params = { category: 'creative' } as const;
		vi.mocked(apiClient.getThemes).mockResolvedValue(themes);

		const { result } = renderHook(() => useThemes(params), { wrapper });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(apiClient.getThemes).toHaveBeenCalledWith(params);
		expect(queryClient.getQueryData(queryKeys.themes.list(params))).toEqual(themes);
	});

	it('useThemes は params が異なればキャッシュを共有しない', async () => {
		vi.mocked(apiClient.getThemes).mockResolvedValue([buildTheme()]);

		const { result } = renderHook(() => useThemes({ category: 'study' }), { wrapper });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(queryClient.getQueryData(queryKeys.themes.list({ category: 'study' }))).toBeDefined();
		expect(
			queryClient.getQueryData(queryKeys.themes.list({ category: 'creative' })),
		).toBeUndefined();
	});

	it('useSystemThemes は themes/system のキーで取得する', async () => {
		const themes = [buildTheme({ isSystem: true })];
		vi.mocked(apiClient.getSystemThemes).mockResolvedValue(themes);

		const { result } = renderHook(() => useSystemThemes(), { wrapper });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(queryClient.getQueryData(queryKeys.themes.system())).toEqual(themes);
	});

	it('usePublicThemes は themes/public のキーで取得する', async () => {
		const themes = [buildTheme({ isPublic: true })];
		vi.mocked(apiClient.getPublicThemes).mockResolvedValue(themes);

		const { result } = renderHook(() => usePublicThemes(), { wrapper });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(queryClient.getQueryData(queryKeys.themes.public())).toEqual(themes);
	});

	it('useThemesByCategory はカテゴリを queryKey と API 引数の両方に渡す', async () => {
		const themes = [buildTheme()];
		vi.mocked(apiClient.getThemesByCategory).mockResolvedValue(themes);

		const { result } = renderHook(() => useThemesByCategory('seasonal'), { wrapper });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(apiClient.getThemesByCategory).toHaveBeenCalledWith('seasonal');
		expect(queryClient.getQueryData(queryKeys.themes.category('seasonal'))).toEqual(themes);
	});

	it('useTheme は themes/detail/:id のキーで取得する', async () => {
		const theme = buildTheme();
		vi.mocked(apiClient.getTheme).mockResolvedValue(theme);

		const { result } = renderHook(() => useTheme('theme-1'), { wrapper });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(apiClient.getTheme).toHaveBeenCalledWith('theme-1');
		expect(queryClient.getQueryData(queryKeys.themes.detail('theme-1'))).toEqual(theme);
	});

	it('useTheme は id が空文字なら API を呼ばない（enabled: !!id）', async () => {
		const { result } = renderHook(() => useTheme(''), { wrapper });

		await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
		expect(apiClient.getTheme).not.toHaveBeenCalled();
	});

	it('useFavoriteThemes は themes/favorites のキーで取得する', async () => {
		const themes = [buildTheme({ isFavorited: true })];
		vi.mocked(apiClient.getFavoriteThemes).mockResolvedValue(themes);

		const { result } = renderHook(() => useFavoriteThemes(), { wrapper });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(queryClient.getQueryData(queryKeys.themes.favorites())).toEqual(themes);
	});

	it('API が失敗したらログを残したうえでエラーを伝播する', async () => {
		const error = new Error('boom');
		vi.mocked(apiClient.getThemes).mockRejectedValue(error);

		const { result } = renderHook(() => useThemes(), { wrapper });
		await waitFor(() => expect(result.current.isError).toBe(true));

		expect(result.current.error).toBe(error);
		expect(logger.error).toHaveBeenCalledWith('テーマ取得エラー:', error);
	});
});

// ─── ミューテーション系: キャッシュ無効化の範囲 ────────────────────────────────

describe('useCreateTheme', () => {
	it('成功時にテーマ関連キャッシュを全て無効化する（themes.all）', async () => {
		const created = buildTheme({ id: 'theme-new' });
		vi.mocked(apiClient.createTheme).mockResolvedValue(created);
		const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

		const { result } = renderHook(() => useCreateTheme(), { wrapper });
		result.current.mutate({ name: 'New', styles: {} } as never);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.themes.all });
	});
});

describe('useUpdateTheme', () => {
	it('成功時に詳細キャッシュを差し替え、一覧を無効化する', async () => {
		const updated = buildTheme({ name: 'Renamed' });
		vi.mocked(apiClient.updateTheme).mockResolvedValue(updated);
		queryClient.setQueryData(queryKeys.themes.detail('theme-1'), buildTheme());
		const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

		const { result } = renderHook(() => useUpdateTheme(), { wrapper });
		result.current.mutate({ id: 'theme-1', data: { name: 'Renamed' } });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(apiClient.updateTheme).toHaveBeenCalledWith('theme-1', { name: 'Renamed' });
		expect(queryClient.getQueryData(queryKeys.themes.detail('theme-1'))).toEqual(updated);
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.themes.all });
	});
});

describe('useDeleteTheme', () => {
	it('成功時に詳細キャッシュを除去し、一覧を無効化する', async () => {
		vi.mocked(apiClient.deleteTheme).mockResolvedValue(undefined);
		queryClient.setQueryData(queryKeys.themes.detail('theme-1'), buildTheme());
		const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

		const { result } = renderHook(() => useDeleteTheme(), { wrapper });
		result.current.mutate('theme-1');
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(queryClient.getQueryData(queryKeys.themes.detail('theme-1'))).toBeUndefined();
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.themes.all });
	});
});

describe('useAddToFavoriteThemes', () => {
	it('詳細キャッシュの isFavorited を立てて favoriteCount を 1 増やす', async () => {
		vi.mocked(apiClient.addToFavoriteThemes).mockResolvedValue({ message: 'ok' });
		queryClient.setQueryData(
			queryKeys.themes.detail('theme-1'),
			buildTheme({ isFavorited: false, favoriteCount: 3 }),
		);

		const { result } = renderHook(() => useAddToFavoriteThemes(), { wrapper });
		result.current.mutate('theme-1');
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(queryClient.getQueryData(queryKeys.themes.detail('theme-1'))).toMatchObject({
			isFavorited: true,
			favoriteCount: 4,
		});
	});

	it('テーマ関連キャッシュを全て無効化する（themes.all）', async () => {
		vi.mocked(apiClient.addToFavoriteThemes).mockResolvedValue({ message: 'ok' });
		const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

		const { result } = renderHook(() => useAddToFavoriteThemes(), { wrapper });
		result.current.mutate('theme-1');
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.themes.all });
	});

	it('詳細キャッシュが無ければ書き込まない（undefined のまま）', async () => {
		vi.mocked(apiClient.addToFavoriteThemes).mockResolvedValue({ message: 'ok' });

		const { result } = renderHook(() => useAddToFavoriteThemes(), { wrapper });
		result.current.mutate('theme-unknown');
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(queryClient.getQueryData(queryKeys.themes.detail('theme-unknown'))).toBeUndefined();
	});
});

describe('useRemoveFromFavoriteThemes', () => {
	it('詳細キャッシュの isFavorited を下ろして favoriteCount を 1 減らす', async () => {
		vi.mocked(apiClient.removeFromFavoriteThemes).mockResolvedValue({ message: 'ok' });
		queryClient.setQueryData(
			queryKeys.themes.detail('theme-1'),
			buildTheme({ isFavorited: true, favoriteCount: 3 }),
		);

		const { result } = renderHook(() => useRemoveFromFavoriteThemes(), { wrapper });
		result.current.mutate('theme-1');
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(queryClient.getQueryData(queryKeys.themes.detail('theme-1'))).toMatchObject({
			isFavorited: false,
			favoriteCount: 2,
		});
	});

	it('favoriteCount は 0 未満にならない', async () => {
		vi.mocked(apiClient.removeFromFavoriteThemes).mockResolvedValue({ message: 'ok' });
		queryClient.setQueryData(
			queryKeys.themes.detail('theme-1'),
			buildTheme({ isFavorited: true, favoriteCount: 0 }),
		);

		const { result } = renderHook(() => useRemoveFromFavoriteThemes(), { wrapper });
		result.current.mutate('theme-1');
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(queryClient.getQueryData(queryKeys.themes.detail('theme-1'))).toMatchObject({
			favoriteCount: 0,
		});
	});
});

// ─── 回帰: 無効化が list 以外の系統にも届くこと ─────────────────────────────────

describe('無効化の到達範囲（回帰）', () => {
	/**
	 * queryKeys.themes は list / system / public / category / favorites が
	 * ['themes', X] の兄弟枝として並ぶ。前方一致で無効化する React Query では
	 * lists()（= ['themes','list']）を指定すると兄弟枝に届かず、system / public を
	 * 表示する画面（NotebookEditor 等）が古いテーマを表示し続ける。
	 * ミューテーションが themes.all を無効化することを実キャッシュ状態で確認する。
	 */
	const seedAllThemeCaches = () => {
		queryClient.setQueryData(queryKeys.themes.list(undefined), [buildTheme()]);
		queryClient.setQueryData(queryKeys.themes.system(), [buildTheme()]);
		queryClient.setQueryData(queryKeys.themes.public(), [buildTheme()]);
		queryClient.setQueryData(queryKeys.themes.category('creative'), [buildTheme()]);
		queryClient.setQueryData(queryKeys.themes.favorites(), [buildTheme()]);
	};

	const invalidationState = () => ({
		list: queryClient.getQueryState(queryKeys.themes.list(undefined))?.isInvalidated,
		system: queryClient.getQueryState(queryKeys.themes.system())?.isInvalidated,
		public: queryClient.getQueryState(queryKeys.themes.public())?.isInvalidated,
		category: queryClient.getQueryState(queryKeys.themes.category('creative'))?.isInvalidated,
		favorites: queryClient.getQueryState(queryKeys.themes.favorites())?.isInvalidated,
	});

	const allInvalidated = {
		list: true,
		system: true,
		public: true,
		category: true,
		favorites: true,
	};

	it('useUpdateTheme は system / public / category / favorites も無効化する', async () => {
		vi.mocked(apiClient.updateTheme).mockResolvedValue(buildTheme({ name: 'Renamed' }));
		seedAllThemeCaches();

		const { result } = renderHook(() => useUpdateTheme(), { wrapper });
		result.current.mutate({ id: 'theme-1', data: { name: 'Renamed' } });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(invalidationState()).toEqual(allInvalidated);
	});

	it('useDeleteTheme は system / public / category / favorites も無効化する', async () => {
		vi.mocked(apiClient.deleteTheme).mockResolvedValue(undefined);
		seedAllThemeCaches();

		const { result } = renderHook(() => useDeleteTheme(), { wrapper });
		result.current.mutate('theme-1');
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(invalidationState()).toEqual(allInvalidated);
	});

	it('useAddToFavoriteThemes は system / public / category も無効化する', async () => {
		vi.mocked(apiClient.addToFavoriteThemes).mockResolvedValue({ message: 'ok' });
		seedAllThemeCaches();

		const { result } = renderHook(() => useAddToFavoriteThemes(), { wrapper });
		result.current.mutate('theme-1');
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(invalidationState()).toEqual(allInvalidated);
	});

	it('useRemoveFromFavoriteThemes は system / public / category も無効化する', async () => {
		vi.mocked(apiClient.removeFromFavoriteThemes).mockResolvedValue({ message: 'ok' });
		seedAllThemeCaches();

		const { result } = renderHook(() => useRemoveFromFavoriteThemes(), { wrapper });
		result.current.mutate('theme-1');
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(invalidationState()).toEqual(allInvalidated);
	});
});

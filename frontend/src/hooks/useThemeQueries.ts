import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../utils/api';
import type {
	Theme,
	ThemeSearchParams,
	CreateThemeData,
	UpdateThemeData,
	ThemeCategory,
} from '../types/theme';
import { logger } from '../utils/logger';
import { queryKeys } from '../constants/queryKeys';
import { ENTITY_CACHE_CONFIG } from '../constants/cacheConfig';

// テーマ一覧取得（検索・フィルタリング対応）
export const useThemes = (params?: ThemeSearchParams) => {
	return useQuery({
		queryKey: queryKeys.themes.list(params),
		queryFn: async () => {
			try {
				return await apiClient.getThemes(params);
			} catch (error) {
				logger.error('テーマ取得エラー:', error);
				throw error;
			}
		},
		...ENTITY_CACHE_CONFIG.themes.list,
	});
};

// システムテーマ一覧取得
export const useSystemThemes = () => {
	return useQuery({
		queryKey: queryKeys.themes.system(),
		queryFn: async () => {
			try {
				return await apiClient.getSystemThemes();
			} catch (error) {
				logger.error('システムテーマ取得エラー:', error);
				throw error;
			}
		},
		...ENTITY_CACHE_CONFIG.themes.system,
	});
};

// 公開テーマ一覧取得
export const usePublicThemes = () => {
	return useQuery({
		queryKey: queryKeys.themes.public(),
		queryFn: async () => {
			try {
				return await apiClient.getPublicThemes();
			} catch (error) {
				logger.error('公開テーマ取得エラー:', error);
				throw error;
			}
		},
		...ENTITY_CACHE_CONFIG.themes.public,
	});
};

// カテゴリ別テーマ一覧取得
export const useThemesByCategory = (category: ThemeCategory) => {
	return useQuery({
		queryKey: queryKeys.themes.category(category),
		queryFn: async () => {
			try {
				return await apiClient.getThemesByCategory(category);
			} catch (error) {
				logger.error(`カテゴリ${category}のテーマ取得エラー:`, error);
				throw error;
			}
		},
		...ENTITY_CACHE_CONFIG.themes.list,
	});
};

// 特定テーマ取得
export const useTheme = (id: string) => {
	return useQuery({
		queryKey: queryKeys.themes.detail(id),
		queryFn: async () => {
			try {
				return await apiClient.getTheme(id);
			} catch (error) {
				logger.error(`テーマ${id}取得エラー:`, error);
				throw error;
			}
		},
		enabled: !!id,
		...ENTITY_CACHE_CONFIG.themes.detail,
	});
};

// お気に入りテーマ一覧取得
export const useFavoriteThemes = () => {
	return useQuery({
		queryKey: queryKeys.themes.favorites(),
		queryFn: async () => {
			try {
				return await apiClient.getFavoriteThemes();
			} catch (error) {
				logger.error('お気に入りテーマ取得エラー:', error);
				throw error;
			}
		},
		...ENTITY_CACHE_CONFIG.themes.favorites,
	});
};

// テーマ作成（管理者のみ）
export const useCreateTheme = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: CreateThemeData) => {
			try {
				return await apiClient.createTheme(data);
			} catch (error) {
				logger.error('テーマ作成エラー:', error);
				throw error;
			}
		},
		onSuccess: () => {
			// テーマ一覧を無効化して再取得
			queryClient.invalidateQueries({ queryKey: queryKeys.themes.all });
		},
	});
};

// テーマ更新（管理者のみ）
export const useUpdateTheme = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, data }: { id: string; data: UpdateThemeData }) => {
			try {
				return await apiClient.updateTheme(id, data);
			} catch (error) {
				logger.error('テーマ更新エラー:', error);
				throw error;
			}
		},
		onSuccess: (updatedTheme) => {
			// 特定テーマのキャッシュを更新
			queryClient.setQueryData(queryKeys.themes.detail(updatedTheme.id), updatedTheme);
			// themes 配下を全て無効化する。lists() は ['themes','list'] 前方一致のため
			// 兄弟枝の system / public / category に届かず、それらを表示する画面
			// （NotebookEditor 等）が古いテーマを表示し続ける。
			queryClient.invalidateQueries({ queryKey: queryKeys.themes.all });
		},
	});
};

// テーマ削除（管理者のみ）
export const useDeleteTheme = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			try {
				await apiClient.deleteTheme(id);
				return id;
			} catch (error) {
				logger.error('テーマ削除エラー:', error);
				throw error;
			}
		},
		onSuccess: (deletedId) => {
			// 削除されたテーマのキャッシュを削除
			queryClient.removeQueries({ queryKey: queryKeys.themes.detail(deletedId) });
			// system / public / category にも消えたテーマが載っているため themes 配下を全て無効化する
			queryClient.invalidateQueries({ queryKey: queryKeys.themes.all });
		},
	});
};

// お気に入りテーマ追加
export const useAddToFavoriteThemes = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (themeId: string) => {
			try {
				return await apiClient.addToFavoriteThemes(themeId);
			} catch (error) {
				logger.error('お気に入り追加エラー:', error);
				throw error;
			}
		},
		onSuccess: (_, themeId) => {
			// 再取得を待たずに詳細画面へ反映する
			queryClient.setQueryData(queryKeys.themes.detail(themeId), (old: Theme | undefined) => {
				if (old) {
					return { ...old, isFavorited: true, favoriteCount: old.favoriteCount + 1 };
				}
				return old;
			});
			// isFavorited / favoriteCount は favorites だけでなく list / system / public /
			// category の全系統に載るため、themes 配下をまとめて無効化する。
			queryClient.invalidateQueries({ queryKey: queryKeys.themes.all });
		},
	});
};

// お気に入りテーマ削除
export const useRemoveFromFavoriteThemes = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (themeId: string) => {
			try {
				return await apiClient.removeFromFavoriteThemes(themeId);
			} catch (error) {
				logger.error('お気に入り削除エラー:', error);
				throw error;
			}
		},
		onSuccess: (_, themeId) => {
			// 再取得を待たずに詳細画面へ反映する
			queryClient.setQueryData(queryKeys.themes.detail(themeId), (old: Theme | undefined) => {
				if (old) {
					return { ...old, isFavorited: false, favoriteCount: Math.max(0, old.favoriteCount - 1) };
				}
				return old;
			});
			// isFavorited / favoriteCount は favorites だけでなく list / system / public /
			// category の全系統に載るため、themes 配下をまとめて無効化する。
			queryClient.invalidateQueries({ queryKey: queryKeys.themes.all });
		},
	});
};

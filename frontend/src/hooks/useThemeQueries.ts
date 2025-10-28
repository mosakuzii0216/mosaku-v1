import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../utils/api';
import type {
	Theme,
	ThemeSearchParams,
	CreateThemeData,
	UpdateThemeData,
	ThemeCategory,
} from '../types/theme';

// Query Keys
export const themeKeys = {
	all: ['themes'] as const,
	lists: () => [...themeKeys.all, 'list'] as const,
	list: (params?: ThemeSearchParams) => [...themeKeys.lists(), params] as const,
	details: () => [...themeKeys.all, 'detail'] as const,
	detail: (id: string) => [...themeKeys.details(), id] as const,
	system: () => [...themeKeys.all, 'system'] as const,
	public: () => [...themeKeys.all, 'public'] as const,
	category: (category: string) => [...themeKeys.all, 'category', category] as const,
	favorites: () => [...themeKeys.all, 'favorites'] as const,
};

// テーマ一覧取得（検索・フィルタリング対応）
export const useThemes = (params?: ThemeSearchParams) => {
	return useQuery({
		queryKey: themeKeys.list(params),
		queryFn: async () => {
			try {
				return await apiClient.getThemes(params);
			} catch (error) {
				console.error('テーマ取得エラー:', error);
				throw error;
			}
		},
		staleTime: 5 * 60 * 1000, // 5分
	});
};

// システムテーマ一覧取得
export const useSystemThemes = () => {
	return useQuery({
		queryKey: themeKeys.system(),
		queryFn: async () => {
			try {
				return await apiClient.getSystemThemes();
			} catch (error) {
				console.error('システムテーマ取得エラー:', error);
				throw error;
			}
		},
		staleTime: 10 * 60 * 1000, // 10分（システムテーマは変更頻度が低い）
	});
};

// 公開テーマ一覧取得
export const usePublicThemes = () => {
	return useQuery({
		queryKey: themeKeys.public(),
		queryFn: async () => {
			try {
				return await apiClient.getPublicThemes();
			} catch (error) {
				console.error('公開テーマ取得エラー:', error);
				throw error;
			}
		},
		staleTime: 5 * 60 * 1000, // 5分
	});
};

// カテゴリ別テーマ一覧取得
export const useThemesByCategory = (category: ThemeCategory) => {
	return useQuery({
		queryKey: themeKeys.category(category),
		queryFn: async () => {
			try {
				return await apiClient.getThemesByCategory(category);
			} catch (error) {
				console.error(`カテゴリ${category}のテーマ取得エラー:`, error);
				throw error;
			}
		},
		staleTime: 5 * 60 * 1000, // 5分
	});
};

// 特定テーマ取得
export const useTheme = (id: string) => {
	return useQuery({
		queryKey: themeKeys.detail(id),
		queryFn: async () => {
			try {
				return await apiClient.getTheme(id);
			} catch (error) {
				console.error(`テーマ${id}取得エラー:`, error);
				throw error;
			}
		},
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5分
	});
};

// お気に入りテーマ一覧取得
export const useFavoriteThemes = () => {
	return useQuery({
		queryKey: themeKeys.favorites(),
		queryFn: async () => {
			try {
				return await apiClient.getFavoriteThemes();
			} catch (error) {
				console.error('お気に入りテーマ取得エラー:', error);
				throw error;
			}
		},
		staleTime: 1 * 60 * 1000, // 1分（お気に入りは頻繁に変更される可能性）
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
				console.error('テーマ作成エラー:', error);
				throw error;
			}
		},
		onSuccess: () => {
			// テーマ一覧を無効化して再取得
			queryClient.invalidateQueries({ queryKey: themeKeys.all });
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
				console.error('テーマ更新エラー:', error);
				throw error;
			}
		},
		onSuccess: (updatedTheme) => {
			// 特定テーマのキャッシュを更新
			queryClient.setQueryData(themeKeys.detail(updatedTheme.id), updatedTheme);
			// テーマ一覧を無効化
			queryClient.invalidateQueries({ queryKey: themeKeys.lists() });
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
				console.error('テーマ削除エラー:', error);
				throw error;
			}
		},
		onSuccess: (deletedId) => {
			// 削除されたテーマのキャッシュを削除
			queryClient.removeQueries({ queryKey: themeKeys.detail(deletedId) });
			// テーマ一覧を無効化
			queryClient.invalidateQueries({ queryKey: themeKeys.lists() });
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
				console.error('お気に入り追加エラー:', error);
				throw error;
			}
		},
		onSuccess: (_, themeId) => {
			// お気に入り一覧を無効化
			queryClient.invalidateQueries({ queryKey: themeKeys.favorites() });
			// テーマ詳細のisFavoritedを更新
			queryClient.setQueryData(themeKeys.detail(themeId), (old: Theme | undefined) => {
				if (old) {
					return { ...old, isFavorited: true, favoriteCount: old.favoriteCount + 1 };
				}
				return old;
			});
			// テーマ一覧も無効化（isFavoritedフラグの更新）
			queryClient.invalidateQueries({ queryKey: themeKeys.lists() });
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
				console.error('お気に入り削除エラー:', error);
				throw error;
			}
		},
		onSuccess: (_, themeId) => {
			// お気に入り一覧を無効化
			queryClient.invalidateQueries({ queryKey: themeKeys.favorites() });
			// テーマ詳細のisFavoritedを更新
			queryClient.setQueryData(themeKeys.detail(themeId), (old: Theme | undefined) => {
				if (old) {
					return { ...old, isFavorited: false, favoriteCount: Math.max(0, old.favoriteCount - 1) };
				}
				return old;
			});
			// テーマ一覧も無効化（isFavoritedフラグの更新）
			queryClient.invalidateQueries({ queryKey: themeKeys.lists() });
		},
	});
};

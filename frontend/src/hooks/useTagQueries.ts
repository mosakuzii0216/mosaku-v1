import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../utils/api';
import type { CreateTagDto, UpdateTagDto, AssignTagsDto } from '../types/tag';
import { logger } from '../utils/logger';
import { queryKeys } from '../constants/queryKeys';
import { ENTITY_CACHE_CONFIG, getDefaultQueryOptions } from '../constants/cacheConfig';

/**
 * タグ関連のReact Query hooks
 * React Query を唯一の真実の源泉として使用（Zustand へのコピーは行わない）
 */
export const useTagQueries = () => {
	const queryClient = useQueryClient();

	// タグ一覧取得
	const tagsQuery = useQuery({
		queryKey: queryKeys.tags.all,
		queryFn: async () => {
			try {
				return await apiClient.getTags();
			} catch (error) {
				logger.error('タグ取得エラー:', error);
				throw error;
			}
		},
		...getDefaultQueryOptions(),
		...ENTITY_CACHE_CONFIG.tags.list,
	});

	// タグ作成
	const createTagMutation = useMutation({
		mutationFn: (data: CreateTagDto) => apiClient.createTag(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
		},
	});

	// タグ更新
	const updateTagMutation = useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateTagDto }) => apiClient.updateTag(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
		},
	});

	// タグ削除
	const deleteTagMutation = useMutation({
		mutationFn: (id: string) => apiClient.deleteTag(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.all });
		},
	});

	// メモにタグを割り当て
	const assignTagsMutation = useMutation({
		mutationFn: ({ memoId, data }: { memoId: string; data: AssignTagsDto }) =>
			apiClient.assignTagsToMemo(memoId, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.all });
		},
	});

	// タグ検索（Hookとして公開）
	const useSearchTagsQuery = (query: string) =>
		useQuery({
			queryKey: queryKeys.tags.search(query),
			queryFn: () => apiClient.searchTags(query),
			enabled: !!query,
			...ENTITY_CACHE_CONFIG.tags.search,
		});

	return {
		// Queries
		tagsQuery,
		useSearchTagsQuery,

		// Mutations
		createTag: createTagMutation.mutateAsync,
		updateTag: updateTagMutation.mutateAsync,
		deleteTag: deleteTagMutation.mutate,
		assignTags: assignTagsMutation.mutate,

		// Loading states
		isCreating: createTagMutation.isPending,
		isUpdating: updateTagMutation.isPending,
		isDeleting: deleteTagMutation.isPending,
		isAssigning: assignTagsMutation.isPending,
	};
};

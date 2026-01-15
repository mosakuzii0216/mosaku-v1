import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../utils/api';
import { useViewStore } from '../stores/useViewStore';
import { useTagStore } from '../stores/useTagStore';
import type { CreateMemoDto, UpdateMemoDto } from '../types/memo';
import { queryKeys } from '../constants/queryKeys';

/**
 * メモ一覧取得
 * React Query を唯一の真実の源泉として使用（Zustand へのコピーは行わない）
 */
export const useMemos = () => {
	const { selectedTags } = useTagStore();

	return useQuery({
		queryKey: queryKeys.memos.list(selectedTags),
		queryFn: () => apiClient.getMemos(selectedTags.length > 0 ? selectedTags : undefined),
	});
};

// 特定メモ取得
export const useMemo = (id: string) => {
	return useQuery({
		queryKey: queryKeys.memos.detail(id),
		queryFn: () => apiClient.getMemo(id),
		enabled: !!id,
	});
};

/**
 * メモ検索
 * React Query を唯一の真実の源泉として使用
 */
export const useSearchMemos = (query: string) => {
	const { selectedTags } = useTagStore();

	return useQuery({
		queryKey: queryKeys.memos.search(query, selectedTags),
		queryFn: () => apiClient.searchMemos(query, selectedTags.length > 0 ? selectedTags : undefined),
		enabled: query.length > 0,
	});
};

// メモ作成
export const useCreateMemo = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreateMemoDto) => apiClient.createMemo(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.list() });
		},
	});
};

// メモ更新
export const useUpdateMemo = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateMemoDto }) =>
			apiClient.updateMemo(id, data),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.list() });
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.detail(data.id) });
		},
	});
};

// メモ削除
export const useDeleteMemo = () => {
	const queryClient = useQueryClient();
	const { goToList } = useViewStore();

	return useMutation({
		mutationFn: (id: string) => apiClient.deleteMemo(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.list() });
			goToList();
		},
	});
};

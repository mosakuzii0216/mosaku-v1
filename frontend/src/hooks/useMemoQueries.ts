import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiClient } from '../utils/api';
import { useMemoStore } from '../stores/useMemoStore';
import { useTagStore } from '../stores/useTagStore';
import type { CreateMemoDto, UpdateMemoDto } from '../types/memo';
import { queryKeys } from '../constants/queryKeys';

// メモ一覧取得
export const useMemos = () => {
	const { setMemos } = useMemoStore();
	const { selectedTags } = useTagStore();

	const query = useQuery({
		queryKey: queryKeys.memos.list(selectedTags),
		queryFn: () => apiClient.getMemos(selectedTags.length > 0 ? selectedTags : undefined),
	});

	useEffect(() => {
		if (query.data) {
			setMemos(query.data);
		}
	}, [query.data, setMemos]);

	return query;
};

// 特定メモ取得
export const useMemo = (id: string) => {
	return useQuery({
		queryKey: queryKeys.memos.detail(id),
		queryFn: () => apiClient.getMemo(id),
		enabled: !!id,
	});
};

// メモ検索
export const useSearchMemos = (query: string) => {
	const { setMemos } = useMemoStore();
	const { selectedTags } = useTagStore();

	const searchQuery = useQuery({
		queryKey: queryKeys.memos.search(query, selectedTags),
		queryFn: () => apiClient.searchMemos(query, selectedTags.length > 0 ? selectedTags : undefined),
		enabled: query.length > 0,
	});

	useEffect(() => {
		if (searchQuery.data) {
			setMemos(searchQuery.data);
		}
	}, [searchQuery.data, setMemos]);

	return searchQuery;
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
	const { goToList } = useMemoStore();

	return useMutation({
		mutationFn: (id: string) => apiClient.deleteMemo(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.list() });
			goToList();
		},
	});
};

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiClient } from '../utils/api';
import { useMemoStore } from '../stores/useMemoStore';
import { useTagStore } from '../stores/useTagStore';
import type { CreateMemoDto, UpdateMemoDto } from '../types/memo';

const QUERY_KEYS = {
  memos: (tagIds?: string[]) => ['memos', { tagIds }] as const,
  memo: (id: string) => ['memos', id] as const,
  search: (query: string, tagIds?: string[]) => ['memos', 'search', query, { tagIds }] as const,
};

// メモ一覧取得
export const useMemos = () => {
  const { setMemos } = useMemoStore();
  const { selectedTags } = useTagStore();
  
  const query = useQuery({
    queryKey: QUERY_KEYS.memos(selectedTags),
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
    queryKey: QUERY_KEYS.memo(id),
    queryFn: () => apiClient.getMemo(id),
    enabled: !!id,
  });
};

// メモ検索
export const useSearchMemos = (query: string) => {
  const { setMemos } = useMemoStore();
  const { selectedTags } = useTagStore();
  
  const searchQuery = useQuery({
    queryKey: QUERY_KEYS.search(query, selectedTags),
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
  const { addMemo, goToDetail } = useMemoStore();
  
  const mutation = useMutation({
    mutationFn: (data: CreateMemoDto) => apiClient.createMemo(data),
  });

  useEffect(() => {
    if (mutation.isSuccess && mutation.data) {
      queryClient.invalidateQueries({ queryKey: ['memos'] });
      addMemo(mutation.data);
      goToDetail(mutation.data);
    }
  }, [mutation.isSuccess, mutation.data, queryClient, addMemo, goToDetail]);

  return mutation;
};

// メモ更新
export const useUpdateMemo = () => {
  const queryClient = useQueryClient();
  const { updateMemo } = useMemoStore();
  
  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMemoDto }) =>
      apiClient.updateMemo(id, data),
  });

  useEffect(() => {
    if (mutation.isSuccess && mutation.data) {
      queryClient.invalidateQueries({ queryKey: ['memos'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.memo(mutation.data.id) });
      updateMemo(mutation.data);
    }
  }, [mutation.isSuccess, mutation.data, queryClient, updateMemo]);

  return mutation;
};

// メモ削除
export const useDeleteMemo = () => {
  const queryClient = useQueryClient();
  const { deleteMemo, goToList } = useMemoStore();
  
  const mutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteMemo(id),
  });

  useEffect(() => {
    if (mutation.isSuccess && mutation.variables) {
      queryClient.invalidateQueries({ queryKey: ['memos'] });
      deleteMemo(mutation.variables);
      goToList();
    }
  }, [mutation.isSuccess, mutation.variables, queryClient, deleteMemo, goToList]);

  return mutation;
};

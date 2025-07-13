import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../utils/api';
import { useTagStore } from '../stores/useTagStore';
import type { CreateTagDto, UpdateTagDto, AssignTagsDto } from '../types/tag';

export const useTagQueries = () => {
  const queryClient = useQueryClient();
  const { setTags, addTag, updateTag, deleteTag } = useTagStore();

  // タグ一覧取得
  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: apiClient.getTags,
    retry: 1,
    staleTime: 30000, // 30秒間はキャッシュを使用
  });

  // タグ作成
  const createTagMutation = useMutation({
    mutationFn: (data: CreateTagDto) => apiClient.createTag(data),
    onSuccess: (newTag) => {
      addTag(newTag);
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  // タグ更新
  const updateTagMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTagDto }) =>
      apiClient.updateTag(id, data),
    onSuccess: (updatedTag) => {
      updateTag(updatedTag);
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  // タグ削除
  const deleteTagMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteTag(id),
    onSuccess: (_, deletedId) => {
      deleteTag(deletedId);
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['memos'] });
    },
  });

  // メモにタグを割り当て
  const assignTagsMutation = useMutation({
    mutationFn: ({ memoId, data }: { memoId: string; data: AssignTagsDto }) =>
      apiClient.assignTagsToMemo(memoId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memos'] });
    },
  });

  // タグ検索
  const searchTagsQuery = (query: string) =>
    useQuery({
      queryKey: ['tags', 'search', query],
      queryFn: () => apiClient.searchTags(query),
      enabled: !!query,
    });

  return {
    // Queries
    tagsQuery,
    searchTagsQuery,

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
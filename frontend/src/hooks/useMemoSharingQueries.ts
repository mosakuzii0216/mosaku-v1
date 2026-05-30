import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../utils/api';
import { queryKeys } from '../constants/queryKeys';
import type {
	PublishMemoResponseDto,
	PublicMemoListItemDto,
	PublicMemoResponseDto,
} from '../types/memo';

/**
 * 自分の公開中メモ一覧を取得する Query。
 */
export const useMyPublicMemos = () => {
	return useQuery<PublicMemoListItemDto[]>({
		queryKey: queryKeys.memos.publicMine(),
		queryFn: () => apiClient.getMyPublicMemos(),
	});
};

/**
 * 公開トークンでメモを取得する Query（未ログイン閲覧者向け）。
 * - `token` が空文字なら `enabled: false`
 * - 404 即時失敗（リトライ無効）
 * - 短い staleTime / gcTime でブラウザキャッシュと整合させる
 */
export const usePublicMemo = (token: string) => {
	return useQuery<PublicMemoResponseDto>({
		queryKey: queryKeys.memos.publicView(token),
		queryFn: () => apiClient.getPublicMemo(token),
		enabled: !!token,
		retry: false,
		staleTime: 30_000,
		gcTime: 60_000,
	});
};

/**
 * メモを公開する Mutation（所有者向け）。
 * 成功時にメモ詳細・一覧・自分の公開メモ一覧のキャッシュを無効化する。
 */
export const usePublishMemo = () => {
	const queryClient = useQueryClient();
	return useMutation<PublishMemoResponseDto, Error, string>({
		mutationFn: (memoId: string) => apiClient.publishMemo(memoId),
		onSuccess: (_data, memoId) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.detail(memoId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.lists() });
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.publicMine() });
		},
	});
};

/**
 * メモを非公開にする Mutation（所有者向け）。
 * 成功時にメモ詳細・一覧・自分の公開メモ一覧のキャッシュを無効化する。
 */
export const useUnpublishMemo = () => {
	const queryClient = useQueryClient();
	return useMutation<{ success: boolean }, Error, string>({
		mutationFn: (memoId: string) => apiClient.unpublishMemo(memoId),
		onSuccess: (_data, memoId) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.detail(memoId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.lists() });
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.publicMine() });
		},
	});
};

/**
 * 公開トークンを再生成する Mutation（所有者向け）。
 * 成功時にメモ詳細・一覧・自分の公開メモ一覧を invalidate し、
 * 旧トークンの publicView キャッシュを明示的に除去する。
 */
export const useRegenerateMemoToken = () => {
	const queryClient = useQueryClient();
	return useMutation<PublishMemoResponseDto, Error, { memoId: string; oldToken: string }>({
		mutationFn: ({ memoId }) => apiClient.regenerateMemoToken(memoId),
		onSuccess: (_data, { memoId, oldToken }) => {
			queryClient.removeQueries({ queryKey: queryKeys.memos.publicView(oldToken) });
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.detail(memoId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.lists() });
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.publicMine() });
		},
	});
};

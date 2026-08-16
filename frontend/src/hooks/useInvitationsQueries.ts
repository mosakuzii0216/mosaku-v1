import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../utils/api';
import { queryKeys } from '../constants/queryKeys';
import type {
	InvitationContextResponse,
	InvitationWithShareUrlResponse,
	UserQuotaResponse,
	InvitationOAuthProvider,
	OAuthStartResponse,
} from '../types/invitation';
import type { ApiError } from '../utils/apiError';

/**
 * 招待コード文脈を検証する Query。
 * - `code` が空文字なら `enabled: false`
 * - 無効コードでリトライしないよう `retry: false`
 * - エラーは `ApiError` のまま伝播するので呼び出し側で `error.code` を判定
 */
export const useInvitationContext = (input: { code: string }) => {
	const code = input.code;
	return useQuery<InvitationContextResponse, ApiError>({
		queryKey: queryKeys.invitations.context(code),
		queryFn: () => apiClient.verifyInvitationContext({ code }),
		enabled: !!code,
		retry: false,
	});
};

/**
 * 自分の招待コード一覧を取得する Query。
 */
export const useMyInvitations = () => {
	return useQuery<InvitationWithShareUrlResponse[], ApiError>({
		queryKey: queryKeys.invitations.myList(),
		queryFn: () => apiClient.getMyInvitations(),
	});
};

/**
 * 自分の招待 quota 残数を取得する Query。
 */
export const useMyInvitationQuota = () => {
	return useQuery<UserQuotaResponse, ApiError>({
		queryKey: queryKeys.invitations.myQuota(),
		queryFn: () => apiClient.getMyInvitationQuota(),
	});
};

/**
 * 自分の招待コードを発行する Mutation。
 * 成功時に自分の招待一覧と quota スナップショットを invalidate する。
 */
export const useCreateMyInvitation = () => {
	const queryClient = useQueryClient();
	return useMutation<InvitationWithShareUrlResponse, ApiError, void>({
		mutationFn: () => apiClient.createMyInvitation(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.invitations.myList() });
			queryClient.invalidateQueries({ queryKey: queryKeys.invitations.myQuota() });
		},
	});
};

/**
 * 自分の招待コードを削除する Mutation。
 */
export const useDeleteMyInvitation = () => {
	const queryClient = useQueryClient();
	return useMutation<void, ApiError, { id: string }>({
		mutationFn: (input) => apiClient.deleteMyInvitation(input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.invitations.myList() });
		},
	});
};

/**
 * OAuth 登録開始のための Mutation。
 * 成功時の `window.location.assign(authorizationUrl)` はコンポーネント側の責務。
 */
export const useStartOAuthRegistration = () => {
	return useMutation<
		OAuthStartResponse,
		ApiError,
		{ provider: InvitationOAuthProvider; invitationCode: string }
	>({
		mutationFn: (input) => apiClient.startOAuthRegistration(input),
	});
};

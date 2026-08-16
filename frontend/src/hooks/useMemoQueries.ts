import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useViewStore } from '../stores/useViewStore';
import { useTagStore } from '../stores/useTagStore';
import type { CreateMemoDto, Memo, UpdateMemoDto } from '../types/memo';
import type { PaginatedResult, PaginationParams } from '../types/pagination';
import { queryKeys } from '../constants/queryKeys';
import { ENTITY_CACHE_CONFIG } from '../constants/cacheConfig';
import { getMemoBridge } from '../utils/memo/memo-bridge-instance';

// list / paginated / search / trash の各キャッシュは Memo[] か PaginatedResult<Memo> のどちらか。
// detail を初回取得する間、選択 UI が空に見えないよう一致する Memo を探す。
const findCachedMemoById = (
	caches: Array<readonly [unknown, Memo[] | PaginatedResult<Memo> | undefined]>,
	id: string,
): Memo | undefined => {
	for (const [, data] of caches) {
		if (!data) continue;
		const items: Memo[] = Array.isArray(data) ? data : data.data;
		const found = items?.find((m) => m.id === id);
		if (found) return found;
	}
	return undefined;
};

/**
 * メモ一覧取得
 * MemoBridge 経由でオンラインは apiClient、オフラインは IndexedDB から取得する。
 */
export const useMemos = () => {
	const { selectedTags } = useTagStore();

	return useQuery({
		queryKey: queryKeys.memos.list(selectedTags),
		queryFn: () => getMemoBridge().listMemos(selectedTags.length > 0 ? selectedTags : undefined),
		networkMode: 'offlineFirst',
		...ENTITY_CACHE_CONFIG.memos.list,
	});
};

/**
 * メモ一覧取得（ページネーション対応）
 */
export const useMemosPaginated = (pagination: PaginationParams = { page: 1, limit: 20 }) => {
	const { selectedTags } = useTagStore();

	return useQuery({
		queryKey: [...queryKeys.memos.list(selectedTags), 'paginated', pagination],
		queryFn: () =>
			getMemoBridge().getMemosPaginated(
				pagination,
				selectedTags.length > 0 ? selectedTags : undefined,
			),
		placeholderData: keepPreviousData,
		networkMode: 'offlineFirst',
		...ENTITY_CACHE_CONFIG.memos.list,
	});
};

// 特定メモ取得
export const useMemo = (id: string) => {
	const queryClient = useQueryClient();
	return useQuery({
		queryKey: queryKeys.memos.detail(id),
		queryFn: () => getMemoBridge().getMemo(id),
		enabled: !!id,
		networkMode: 'offlineFirst',
		// 選択直後にネットワーク完了を待たず、リスト/検索/ゴミ箱キャッシュから即座に表示する。
		// これがないと detail フェッチ中は data が undefined になり「メモが選択されていません」が一瞬出る。
		placeholderData: () => {
			if (!id) return undefined;
			const caches = queryClient.getQueriesData<Memo[] | PaginatedResult<Memo>>({
				queryKey: queryKeys.memos.all,
			});
			return findCachedMemoById(caches, id);
		},
		...ENTITY_CACHE_CONFIG.memos.detail,
	});
};

/**
 * メモ検索
 */
export const useSearchMemos = (query: string) => {
	const { selectedTags } = useTagStore();

	return useQuery({
		queryKey: queryKeys.memos.search(query, selectedTags),
		queryFn: () =>
			getMemoBridge().searchMemos(query, selectedTags.length > 0 ? selectedTags : undefined),
		enabled: query.length > 0,
		networkMode: 'offlineFirst',
		...ENTITY_CACHE_CONFIG.memos.search,
	});
};

/**
 * メモ検索（ページネーション対応）
 */
export const useSearchMemosPaginated = (
	query: string,
	pagination: PaginationParams = { page: 1, limit: 20 },
) => {
	const { selectedTags } = useTagStore();

	return useQuery({
		queryKey: [...queryKeys.memos.search(query, selectedTags), 'paginated', pagination],
		queryFn: () =>
			getMemoBridge().searchMemosPaginated(
				query,
				pagination,
				selectedTags.length > 0 ? selectedTags : undefined,
			),
		enabled: query.length > 0,
		placeholderData: keepPreviousData,
		networkMode: 'offlineFirst',
		...ENTITY_CACHE_CONFIG.memos.search,
	});
};

// メモ作成（オンライン専用）
export const useCreateMemo = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreateMemoDto) => getMemoBridge().createMemo(data),
		networkMode: 'offlineFirst',
		onSuccess: (createdMemo) => {
			// 作成直後にdetailキャッシュを注入して、edit遷移時の「メモが選択されていません」瞬間点滅を防ぐ
			queryClient.setQueryData(queryKeys.memos.detail(createdMemo.id), createdMemo);
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.list() });
		},
	});
};

// メモ更新
export const useUpdateMemo = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateMemoDto }) =>
			getMemoBridge().updateMemo(id, data),
		networkMode: 'offlineFirst',
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.list() });
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.detail(result.memo.id) });
		},
	});
};

// メモ削除（soft delete: ゴミ箱に移動）
export const useDeleteMemo = () => {
	const queryClient = useQueryClient();
	const { goToMemoList } = useViewStore();

	return useMutation({
		mutationFn: (id: string) => getMemoBridge().trashMemo(id),
		networkMode: 'offlineFirst',
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.list() });
			goToMemoList();
		},
	});
};

// ゴミ箱内メモ一覧取得
export const useTrashMemos = () => {
	return useQuery({
		queryKey: queryKeys.memos.trash(),
		queryFn: () => getMemoBridge().getTrashMemos(),
		networkMode: 'offlineFirst',
		...ENTITY_CACHE_CONFIG.memos.list,
	});
};

// ゴミ箱内メモを復元する
export const useRestoreMemo = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => getMemoBridge().restoreMemo(id),
		networkMode: 'offlineFirst',
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.all });
		},
	});
};

// ゴミ箱内メモを完全削除する
export const usePermanentDeleteMemo = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => getMemoBridge().permanentDeleteMemo(id),
		networkMode: 'offlineFirst',
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.trash() });
		},
	});
};

// ゴミ箱を空にする
export const useEmptyTrash = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => getMemoBridge().emptyTrash(),
		networkMode: 'offlineFirst',
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.memos.trash() });
		},
	});
};

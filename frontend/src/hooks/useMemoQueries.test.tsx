import React, { type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { Memo } from '../types/memo';
import { queryKeys } from '../constants/queryKeys';
import { useTagStore } from '../stores/useTagStore';
import { useViewStore } from '../stores/useViewStore';

const listMemosMock = vi.fn();
const getMemosPaginatedMock = vi.fn();
const getMemoMock = vi.fn();
const searchMemosMock = vi.fn();
const searchMemosPaginatedMock = vi.fn();
const createMemoMock = vi.fn();
const updateMemoMock = vi.fn();
const trashMemoMock = vi.fn();
const getTrashMemosMock = vi.fn();
const restoreMemoMock = vi.fn();
const permanentDeleteMemoMock = vi.fn();
const emptyTrashMock = vi.fn();

vi.mock('../utils/memo/memo-bridge-instance', () => ({
	getMemoBridge: () => ({
		listMemos: (...args: unknown[]) => listMemosMock(...args),
		getMemosPaginated: (...args: unknown[]) => getMemosPaginatedMock(...args),
		getMemo: (...args: unknown[]) => getMemoMock(...args),
		searchMemos: (...args: unknown[]) => searchMemosMock(...args),
		searchMemosPaginated: (...args: unknown[]) => searchMemosPaginatedMock(...args),
		createMemo: (...args: unknown[]) => createMemoMock(...args),
		updateMemo: (...args: unknown[]) => updateMemoMock(...args),
		trashMemo: (...args: unknown[]) => trashMemoMock(...args),
		getTrashMemos: (...args: unknown[]) => getTrashMemosMock(...args),
		restoreMemo: (...args: unknown[]) => restoreMemoMock(...args),
		permanentDeleteMemo: (...args: unknown[]) => permanentDeleteMemoMock(...args),
		emptyTrash: (...args: unknown[]) => emptyTrashMock(...args),
	}),
}));

const pinMemoMock = vi.fn();
const unpinMemoMock = vi.fn();

vi.mock('../utils/api', () => ({
	apiClient: {
		pinMemo: (...args: unknown[]) => pinMemoMock(...args),
		unpinMemo: (...args: unknown[]) => unpinMemoMock(...args),
	},
}));

import {
	useMemos,
	useMemosPaginated,
	useMemo as useMemoDetail,
	useSearchMemos,
	useSearchMemosPaginated,
	useCreateMemo,
	useUpdateMemo,
	useDeleteMemo,
	useTrashMemos,
	useRestoreMemo,
	usePermanentDeleteMemo,
	useEmptyTrash,
	useTogglePin,
} from './useMemoQueries';

function makeMemo(overrides: Partial<Memo> = {}): Memo {
	return {
		id: 'm1',
		title: 'title',
		content: { type: 'doc', content: [] },
		createdAt: '2026-05-01T00:00:00.000Z',
		updatedAt: '2026-05-01T00:00:00.000Z',
		trashedAt: null,
		...overrides,
	};
}

function makeClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false, gcTime: 0 },
			mutations: { retry: false },
		},
	});
}

function makeWrapper(client: QueryClient) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

const PAGINATED_EMPTY = {
	data: [] as Memo[],
	pagination: {
		page: 1,
		limit: 20,
		total: 0,
		totalPages: 0,
		hasNextPage: false,
		hasPrevPage: false,
	},
};

beforeEach(() => {
	vi.clearAllMocks();
	useTagStore.setState({ selectedTags: [] });
});

describe('useMemos', () => {
	it('タグ未選択なら selectedTags を渡さずに一覧取得する', async () => {
		const memos = [makeMemo()];
		listMemosMock.mockResolvedValue(memos);
		const client = makeClient();

		const { result } = renderHook(() => useMemos(), { wrapper: makeWrapper(client) });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(listMemosMock).toHaveBeenCalledWith(undefined);
		expect(result.current.data).toEqual(memos);
	});

	it('タグ選択中は selectedTags を渡す', async () => {
		useTagStore.setState({ selectedTags: ['tag1'] });
		listMemosMock.mockResolvedValue([]);
		const client = makeClient();

		const { result } = renderHook(() => useMemos(), { wrapper: makeWrapper(client) });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(listMemosMock).toHaveBeenCalledWith(['tag1']);
	});
});

describe('useMemosPaginated', () => {
	it('既定のページネーションで一覧取得する', async () => {
		getMemosPaginatedMock.mockResolvedValue(PAGINATED_EMPTY);
		const client = makeClient();

		const { result } = renderHook(() => useMemosPaginated(), { wrapper: makeWrapper(client) });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(getMemosPaginatedMock).toHaveBeenCalledWith({ page: 1, limit: 20 }, undefined);
	});

	it('指定したページネーションとタグを渡す', async () => {
		useTagStore.setState({ selectedTags: ['tag1'] });
		getMemosPaginatedMock.mockResolvedValue(PAGINATED_EMPTY);
		const client = makeClient();

		const { result } = renderHook(() => useMemosPaginated({ page: 2, limit: 10 }), {
			wrapper: makeWrapper(client),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(getMemosPaginatedMock).toHaveBeenCalledWith({ page: 2, limit: 10 }, ['tag1']);
	});
});

describe('useMemo（detail）', () => {
	it('id が空文字なら取得を行わない', () => {
		const client = makeClient();

		const { result } = renderHook(() => useMemoDetail(''), { wrapper: makeWrapper(client) });

		expect(result.current.fetchStatus).toBe('idle');
		expect(getMemoMock).not.toHaveBeenCalled();
	});

	it('id を指定すると detail を取得する', async () => {
		const memo = makeMemo({ id: 'm2' });
		getMemoMock.mockResolvedValue(memo);
		const client = makeClient();

		const { result } = renderHook(() => useMemoDetail('m2'), { wrapper: makeWrapper(client) });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(getMemoMock).toHaveBeenCalledWith('m2');
		expect(result.current.data).toEqual(memo);
	});

	it('一覧キャッシュに一致するメモがあれば取得完了前にそれを placeholder として返す', async () => {
		const cached = makeMemo({ id: 'm3', title: 'cached title' });
		let resolveGetMemo: (memo: Memo) => void = () => {};
		getMemoMock.mockReturnValue(
			new Promise<Memo>((resolve) => {
				resolveGetMemo = resolve;
			}),
		);
		const client = makeClient();
		client.setQueryData(queryKeys.memos.list([]), [cached]);

		const { result } = renderHook(() => useMemoDetail('m3'), { wrapper: makeWrapper(client) });

		expect(result.current.data).toEqual(cached);
		expect(result.current.isPlaceholderData).toBe(true);

		resolveGetMemo(makeMemo({ id: 'm3', title: 'fetched title' }));
		await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
		expect(result.current.data?.title).toBe('fetched title');
	});

	it('一覧キャッシュに一致するメモが無ければ placeholder は undefined', () => {
		const client = makeClient();
		client.setQueryData(queryKeys.memos.list([]), [makeMemo({ id: 'other' })]);
		getMemoMock.mockReturnValue(new Promise<Memo>(() => {}));

		const { result } = renderHook(() => useMemoDetail('m4'), { wrapper: makeWrapper(client) });

		expect(result.current.data).toBeUndefined();
	});
});

describe('useSearchMemos', () => {
	it('クエリが空なら検索を行わない', () => {
		const client = makeClient();

		const { result } = renderHook(() => useSearchMemos(''), { wrapper: makeWrapper(client) });

		expect(result.current.fetchStatus).toBe('idle');
		expect(searchMemosMock).not.toHaveBeenCalled();
	});

	it('クエリとタグを渡して検索する', async () => {
		useTagStore.setState({ selectedTags: ['tag1'] });
		searchMemosMock.mockResolvedValue([makeMemo()]);
		const client = makeClient();

		const { result } = renderHook(() => useSearchMemos('foo'), { wrapper: makeWrapper(client) });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(searchMemosMock).toHaveBeenCalledWith('foo', ['tag1']);
	});
});

describe('useSearchMemosPaginated', () => {
	it('クエリが空なら検索を行わない', () => {
		const client = makeClient();

		const { result } = renderHook(() => useSearchMemosPaginated(''), {
			wrapper: makeWrapper(client),
		});

		expect(result.current.fetchStatus).toBe('idle');
		expect(searchMemosPaginatedMock).not.toHaveBeenCalled();
	});

	it('クエリ・ページネーション・タグを渡して検索する', async () => {
		useTagStore.setState({ selectedTags: ['tag1'] });
		searchMemosPaginatedMock.mockResolvedValue(PAGINATED_EMPTY);
		const client = makeClient();

		const { result } = renderHook(() => useSearchMemosPaginated('foo', { page: 2, limit: 5 }), {
			wrapper: makeWrapper(client),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(searchMemosPaginatedMock).toHaveBeenCalledWith('foo', { page: 2, limit: 5 }, ['tag1']);
	});
});

describe('useCreateMemo', () => {
	it('作成後に detail キャッシュへ即注入し、一覧を無効化する', async () => {
		const created = makeMemo({ id: 'new-1' });
		createMemoMock.mockResolvedValue(created);
		const client = makeClient();
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
		const setQueryDataSpy = vi.spyOn(client, 'setQueryData');

		const { result } = renderHook(() => useCreateMemo(), { wrapper: makeWrapper(client) });

		await result.current.mutateAsync({ title: 't', content: { type: 'doc', content: [] } });

		expect(createMemoMock).toHaveBeenCalledWith({
			title: 't',
			content: { type: 'doc', content: [] },
		});
		expect(setQueryDataSpy).toHaveBeenCalledWith(queryKeys.memos.detail('new-1'), created);
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.memos.list() });
	});
});

describe('useUpdateMemo', () => {
	it('更新後に一覧と該当 detail を無効化する', async () => {
		const updated = makeMemo({ id: 'm5', title: 'updated' });
		updateMemoMock.mockResolvedValue({ kind: 'synced', memo: updated });
		const client = makeClient();
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

		const { result } = renderHook(() => useUpdateMemo(), { wrapper: makeWrapper(client) });

		const outcome = await result.current.mutateAsync({ id: 'm5', data: { title: 'updated' } });

		expect(updateMemoMock).toHaveBeenCalledWith('m5', { title: 'updated' });
		expect(outcome).toEqual({ kind: 'synced', memo: updated });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.memos.list() });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.memos.detail('m5') });
	});
});

describe('useDeleteMemo', () => {
	it('ゴミ箱移動後に一覧を無効化し、一覧画面へ遷移する', async () => {
		const goToMemoListMock = vi.fn();
		useViewStore.setState({ goToMemoList: goToMemoListMock });
		trashMemoMock.mockResolvedValue({ kind: 'synced', memo: makeMemo({ id: 'm6' }) });
		const client = makeClient();
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

		const { result } = renderHook(() => useDeleteMemo(), { wrapper: makeWrapper(client) });

		await result.current.mutateAsync('m6');

		expect(trashMemoMock).toHaveBeenCalledWith('m6');
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.memos.list() });
		expect(goToMemoListMock).toHaveBeenCalledTimes(1);
	});
});

describe('useTrashMemos', () => {
	it('ゴミ箱内メモ一覧を取得する', async () => {
		const trashed = [makeMemo({ id: 'trashed-1', trashedAt: '2026-05-10T00:00:00.000Z' })];
		getTrashMemosMock.mockResolvedValue(trashed);
		const client = makeClient();

		const { result } = renderHook(() => useTrashMemos(), { wrapper: makeWrapper(client) });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(getTrashMemosMock).toHaveBeenCalledTimes(1);
		expect(result.current.data).toEqual(trashed);
	});
});

describe('useRestoreMemo', () => {
	it('復元後に memos 配下を丸ごと無効化する', async () => {
		restoreMemoMock.mockResolvedValue(makeMemo({ id: 'm7' }));
		const client = makeClient();
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

		const { result } = renderHook(() => useRestoreMemo(), { wrapper: makeWrapper(client) });

		await result.current.mutateAsync('m7');

		expect(restoreMemoMock).toHaveBeenCalledWith('m7');
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.memos.all });
	});
});

describe('usePermanentDeleteMemo', () => {
	it('完全削除後にゴミ箱キャッシュを無効化する', async () => {
		permanentDeleteMemoMock.mockResolvedValue({ kind: 'synced', memo: makeMemo({ id: 'm8' }) });
		const client = makeClient();
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

		const { result } = renderHook(() => usePermanentDeleteMemo(), { wrapper: makeWrapper(client) });

		await result.current.mutateAsync('m8');

		expect(permanentDeleteMemoMock).toHaveBeenCalledWith('m8');
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.memos.trash() });
	});
});

describe('useEmptyTrash', () => {
	it('空にした後にゴミ箱キャッシュを無効化する', async () => {
		emptyTrashMock.mockResolvedValue({ count: 3 });
		const client = makeClient();
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

		const { result } = renderHook(() => useEmptyTrash(), { wrapper: makeWrapper(client) });

		const outcome = await result.current.mutateAsync();

		expect(emptyTrashMock).toHaveBeenCalledTimes(1);
		expect(outcome).toEqual({ count: 3 });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.memos.trash() });
	});
});

describe('useTogglePin', () => {
	it('pinned が false のときは pinMemo を呼ぶ', async () => {
		pinMemoMock.mockResolvedValue(makeMemo({ id: 'm9', pinnedAt: '2026-05-11T00:00:00.000Z' }));
		const client = makeClient();
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

		const { result } = renderHook(() => useTogglePin(), { wrapper: makeWrapper(client) });

		await result.current.mutateAsync({ id: 'm9', pinned: false });

		expect(pinMemoMock).toHaveBeenCalledWith('m9');
		expect(unpinMemoMock).not.toHaveBeenCalled();
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.memos.all });
	});

	it('pinned が true のときは unpinMemo を呼ぶ', async () => {
		unpinMemoMock.mockResolvedValue(makeMemo({ id: 'm10', pinnedAt: null }));
		const client = makeClient();
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

		const { result } = renderHook(() => useTogglePin(), { wrapper: makeWrapper(client) });

		await result.current.mutateAsync({ id: 'm10', pinned: true });

		expect(unpinMemoMock).toHaveBeenCalledWith('m10');
		expect(pinMemoMock).not.toHaveBeenCalled();
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.memos.all });
	});
});

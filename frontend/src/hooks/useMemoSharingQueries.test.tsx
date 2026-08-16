import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';

import type {
	PublishMemoResponseDto,
	PublicMemoListItemDto,
	PublicMemoResponseDto,
} from '../types/memo';

const publishMemo = vi.fn();
const unpublishMemo = vi.fn();
const regenerateMemoToken = vi.fn();
const getMyPublicMemos = vi.fn();
const getPublicMemo = vi.fn();

vi.mock('../utils/api', () => ({
	apiClient: {
		publishMemo: (...args: unknown[]) => publishMemo(...args),
		unpublishMemo: (...args: unknown[]) => unpublishMemo(...args),
		regenerateMemoToken: (...args: unknown[]) => regenerateMemoToken(...args),
		getMyPublicMemos: (...args: unknown[]) => getMyPublicMemos(...args),
		getPublicMemo: (...args: unknown[]) => getPublicMemo(...args),
	},
}));

import {
	useMyPublicMemos,
	usePublicMemo,
	usePublishMemo,
	useUnpublishMemo,
	useRegenerateMemoToken,
} from './useMemoSharingQueries';

function makeWrapper(): {
	wrapper: (props: { children: ReactNode }) => React.JSX.Element;
	client: QueryClient;
} {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
	const wrapper = ({ children }: { children: ReactNode }) =>
		React.createElement(QueryClientProvider, { client }, children);
	return { wrapper, client };
}

const mockPublishResponse: PublishMemoResponseDto = {
	memoId: 'memo-1',
	publicToken: 'abc123_token',
	publishedAt: '2026-05-30T10:00:00Z',
};

const mockListResponse: PublicMemoListItemDto[] = [
	{
		memoId: 'memo-1',
		title: 'テストメモ',
		publicToken: 'abc123_token',
		publishedAt: '2026-05-30T10:00:00Z',
		updatedAt: '2026-05-30T09:00:00Z',
	},
];

const mockPublicMemoResponse: PublicMemoResponseDto = {
	title: 'テストメモ',
	content: '<p>本文</p>',
	updatedAt: '2026-05-30T09:00:00Z',
};

describe('useMyPublicMemos', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('apiClient.getMyPublicMemos を呼んで一覧を返す', async () => {
		getMyPublicMemos.mockResolvedValue(mockListResponse);
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useMyPublicMemos(), { wrapper });

		await waitFor(() => expect(result.current.data).toEqual(mockListResponse));
		expect(getMyPublicMemos).toHaveBeenCalledTimes(1);
	});
});

describe('usePublicMemo', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('token が空文字の場合は fetch されない', () => {
		const { wrapper } = makeWrapper();
		renderHook(() => usePublicMemo(''), { wrapper });
		expect(getPublicMemo).not.toHaveBeenCalled();
	});

	it('token が指定された場合に apiClient.getPublicMemo を呼ぶ', async () => {
		getPublicMemo.mockResolvedValue(mockPublicMemoResponse);
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => usePublicMemo('abc123_token'), { wrapper });

		await waitFor(() => expect(result.current.data).toEqual(mockPublicMemoResponse));
		expect(getPublicMemo).toHaveBeenCalledWith('abc123_token');
	});

	it('404 エラー時にリトライせず即時失敗する', async () => {
		getPublicMemo.mockRejectedValue(new Error('HTTP error! status: 404'));
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => usePublicMemo('invalid_token'), { wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(getPublicMemo).toHaveBeenCalledTimes(1);
	});
});

describe('usePublishMemo', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('apiClient.publishMemo を呼んで PublishMemoResponseDto を返す', async () => {
		publishMemo.mockResolvedValue(mockPublishResponse);
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => usePublishMemo(), { wrapper });

		const response = await act(async () => result.current.mutateAsync('memo-1'));

		expect(publishMemo).toHaveBeenCalledWith('memo-1');
		expect(response).toEqual(mockPublishResponse);
	});

	it('成功時に memos キャッシュ群を invalidate する', async () => {
		publishMemo.mockResolvedValue(mockPublishResponse);
		const { wrapper, client } = makeWrapper();
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
		const { result } = renderHook(() => usePublishMemo(), { wrapper });

		await act(async () => result.current.mutateAsync('memo-1'));

		const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
		const flatKeys = invalidatedKeys.flat();
		expect(flatKeys).toContain('memos');
	});
});

describe('useUnpublishMemo', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('apiClient.unpublishMemo を呼ぶ', async () => {
		unpublishMemo.mockResolvedValue({ success: true });
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useUnpublishMemo(), { wrapper });

		await act(async () => result.current.mutateAsync('memo-1'));

		expect(unpublishMemo).toHaveBeenCalledWith('memo-1');
	});

	it('成功時に memos キャッシュ群を invalidate する', async () => {
		unpublishMemo.mockResolvedValue({ success: true });
		const { wrapper, client } = makeWrapper();
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
		const { result } = renderHook(() => useUnpublishMemo(), { wrapper });

		await act(async () => result.current.mutateAsync('memo-1'));

		const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
		const flatKeys = invalidatedKeys.flat();
		expect(flatKeys).toContain('memos');
	});
});

describe('useRegenerateMemoToken', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('apiClient.regenerateMemoToken を呼んで PublishMemoResponseDto を返す', async () => {
		const newResponse: PublishMemoResponseDto = {
			memoId: 'memo-1',
			publicToken: 'new_token_xyz',
			publishedAt: '2026-05-30T11:00:00Z',
		};
		regenerateMemoToken.mockResolvedValue(newResponse);
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useRegenerateMemoToken(), { wrapper });

		const response = await act(async () =>
			result.current.mutateAsync({ memoId: 'memo-1', oldToken: 'abc123_token' }),
		);

		expect(regenerateMemoToken).toHaveBeenCalledWith('memo-1');
		expect(response).toEqual(newResponse);
	});

	it('成功時に memos キャッシュ群を invalidate し旧 publicView キャッシュを除去する', async () => {
		const newResponse: PublishMemoResponseDto = {
			memoId: 'memo-1',
			publicToken: 'new_token_xyz',
			publishedAt: '2026-05-30T11:00:00Z',
		};
		regenerateMemoToken.mockResolvedValue(newResponse);
		const { wrapper, client } = makeWrapper();
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
		const removeQueriesSpy = vi.spyOn(client, 'removeQueries');
		const { result } = renderHook(() => useRegenerateMemoToken(), { wrapper });

		await act(async () =>
			result.current.mutateAsync({ memoId: 'memo-1', oldToken: 'abc123_token' }),
		);

		const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
		const flatKeys = invalidatedKeys.flat();
		expect(flatKeys).toContain('memos');

		// 旧トークンのキャッシュが除去されることを確認
		const removedKeys = removeQueriesSpy.mock.calls.map((call) => call[0]?.queryKey);
		const removedFlat = removedKeys.flat();
		expect(removedFlat).toContain('abc123_token');
	});
});

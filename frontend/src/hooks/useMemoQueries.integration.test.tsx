import 'fake-indexeddb/auto';
import React, { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { deleteDB } from 'idb';

import type { Memo } from '../types/memo';
import { OFFLINE_DB_NAME, openOfflineDb, type OfflineDB } from '../utils/offline/db';
import { OfflineMemoRepository, type ServerMemoSnapshot } from '../utils/offline/repository';
import { MemoBridge } from '../utils/memo/memo-bridge';
import type { ApiClientLike } from '../utils/memo/types';
import { createSyncEngine, type SyncEngine } from '../utils/sync/sync-engine';
import {
	MemoSyncApiError,
	type MemoSyncApi,
	type MemoSyncUpdatePayload,
} from '../utils/sync/types';
import type { LeaderElection } from '../utils/sync/leader-election';
import { useTagStore } from '../stores/useTagStore';

const bridgeHolder = vi.hoisted(() => ({ current: null as MemoBridge | null }));

vi.mock('../utils/memo/memo-bridge-instance', () => ({
	getMemoBridge: () => {
		if (!bridgeHolder.current) {
			throw new Error('integration test: MemoBridge has not been configured yet');
		}
		return bridgeHolder.current;
	},
	resetMemoBridgeForTest: () => {
		bridgeHolder.current = null;
	},
}));

// useViewStore は useDeleteMemo の中で goToMemoList を呼ぶが、本テストでは使わないので何もしない。
const USER_ID = 'user-1';

async function importHooks() {
	return await import('./useMemoQueries');
}

function snapshotToMemo(s: ServerMemoSnapshot): Memo {
	return {
		id: s.id,
		title: s.title,
		content: s.content,
		createdAt: s.createdAt,
		updatedAt: s.updatedAt,
		trashedAt: s.trashedAt,
		notebookId: s.notebookId,
	};
}

interface FakeServer {
	store: Map<string, ServerMemoSnapshot>;
	api: ApiClientLike;
	syncApi: MemoSyncApi;
	setServerNow: (iso: string) => void;
}

function createFakeServer(initial: ServerMemoSnapshot[]): FakeServer {
	const store = new Map<string, ServerMemoSnapshot>();
	for (const s of initial) store.set(s.id, { ...s });
	let serverNow = '2026-05-15T00:00:00.000Z';

	const api: ApiClientLike = {
		getMemos: vi.fn(async () => Array.from(store.values()).map(snapshotToMemo)),
		getMemo: vi.fn(async (id: string) => {
			const s = store.get(id);
			if (!s) throw new Error('HTTP error! status: 404');
			return snapshotToMemo(s);
		}),
		createMemo: vi.fn(async () => {
			throw new Error('not used in integration test');
		}),
		updateMemo: vi.fn(async (id: string, data) => {
			const s = store.get(id);
			if (!s) throw new Error('HTTP error! status: 404');
			const next: ServerMemoSnapshot = {
				...s,
				title: data.title ?? s.title,
				content: data.content ?? s.content,
				notebookId: data.notebookId !== undefined ? (data.notebookId ?? null) : s.notebookId,
				updatedAt: serverNow,
			};
			store.set(id, next);
			return snapshotToMemo(next);
		}),
		deleteMemo: vi.fn(async (id: string) => {
			const s = store.get(id);
			if (!s) throw new Error('HTTP error! status: 404');
			const next: ServerMemoSnapshot = { ...s, trashedAt: serverNow, updatedAt: serverNow };
			store.set(id, next);
			return snapshotToMemo(next);
		}),
		permanentDeleteMemo: vi.fn(async () => {
			throw new Error('not used');
		}),
		restoreMemo: vi.fn(async () => {
			throw new Error('not used');
		}),
		getTrashMemos: vi.fn(async () => []),
		emptyTrash: vi.fn(async () => ({ count: 0 })),
		searchMemos: vi.fn(async () => []),
		getMemosPaginated: vi.fn(async () => ({
			data: [],
			pagination: {
				page: 1,
				limit: 20,
				total: 0,
				totalPages: 0,
				hasNextPage: false,
				hasPrevPage: false,
			},
		})),
		searchMemosPaginated: vi.fn(async () => ({
			data: [],
			pagination: {
				page: 1,
				limit: 20,
				total: 0,
				totalPages: 0,
				hasNextPage: false,
				hasPrevPage: false,
			},
		})),
	};

	const syncApi: MemoSyncApi = {
		updateMemo: vi.fn(async (id: string, data: MemoSyncUpdatePayload) => {
			const s = store.get(id);
			if (!s) throw new MemoSyncApiError(404, 'not found');
			const next: ServerMemoSnapshot = {
				...s,
				title: data.title ?? s.title,
				content: data.content ?? s.content,
				notebookId: data.notebookId !== undefined ? (data.notebookId ?? null) : s.notebookId,
				updatedAt: serverNow,
			};
			store.set(id, next);
			return next;
		}),
		trashMemo: vi.fn(async (id: string) => {
			const s = store.get(id);
			if (!s) throw new MemoSyncApiError(404, 'not found');
			const next: ServerMemoSnapshot = { ...s, trashedAt: serverNow, updatedAt: serverNow };
			store.set(id, next);
			return next;
		}),
		permanentDeleteMemo: vi.fn(async (id: string) => {
			const s = store.get(id);
			if (!s) throw new MemoSyncApiError(404, 'not found');
			store.delete(id);
			return s;
		}),
		getMemos: vi.fn(async () => Array.from(store.values())),
	};

	return {
		store,
		api,
		syncApi,
		setServerNow: (iso) => {
			serverNow = iso;
		},
	};
}

const alwaysLeader: LeaderElection = {
	async start() {},
	stop() {},
	isLeader() {
		return true;
	},
};

interface TestEnv {
	db: OfflineDB;
	repo: OfflineMemoRepository;
	bridge: MemoBridge;
	engine: SyncEngine;
	fake: FakeServer;
	setOnline: (v: boolean) => void;
}

async function makeEnv(opts: { initial: ServerMemoSnapshot[]; online: boolean }): Promise<TestEnv> {
	const { db } = await openOfflineDb();
	const repo = new OfflineMemoRepository({ db, getCurrentUserId: () => USER_ID });
	// 初期サーバー状態を IDB へ反映してオフライン読み取りの土台にする
	await repo.upsertFromServer(opts.initial);

	let online = opts.online;
	const fake = createFakeServer(opts.initial);

	const bridge = new MemoBridge({
		repository: repo,
		api: fake.api,
		isOnline: () => online,
		now: () => new Date('2026-05-12T00:00:00.000Z'),
	});

	const engine = createSyncEngine({
		repository: repo,
		api: fake.syncApi,
		isOnline: () => online,
		leaderElection: alwaysLeader,
		initialBackoffMs: 1,
		maxBackoffMs: 1,
		maxRetries: 1,
		sleep: async () => {},
	});
	await engine.start();

	bridgeHolder.current = bridge;

	return {
		db,
		repo,
		bridge,
		engine,
		fake,
		setOnline: (v) => {
			online = v;
		},
	};
}

function makeWrapper(client: QueryClient) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

describe('integration: React Query + OfflineMemoRepository + SyncEngine', () => {
	let queryClient: QueryClient;

	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
		queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false, gcTime: 0, staleTime: 0 },
				mutations: { retry: false },
			},
		});
		useTagStore.setState({ selectedTags: [] });
		bridgeHolder.current = null;
	});

	afterEach(async () => {
		queryClient.clear();
		bridgeHolder.current = null;
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('useMemos reads cached memos from IndexedDB while offline (no API call)', async () => {
		const initial: ServerMemoSnapshot[] = [
			{
				id: 'a',
				title: 'cached A',
				content: '<p>aa</p>',
				tagIds: [],
				notebookId: null,
				createdAt: '2026-05-01T00:00:00.000Z',
				updatedAt: '2026-05-01T00:00:00.000Z',
				trashedAt: null,
			},
			{
				id: 'b',
				title: 'cached B',
				content: '<p>bb</p>',
				tagIds: [],
				notebookId: null,
				createdAt: '2026-05-02T00:00:00.000Z',
				updatedAt: '2026-05-02T00:00:00.000Z',
				trashedAt: null,
			},
		];
		const env = await makeEnv({ initial, online: false });
		const { useMemos } = await importHooks();

		try {
			const { result } = renderHook(() => useMemos(), { wrapper: makeWrapper(queryClient) });
			await waitFor(() => expect(result.current.isSuccess).toBe(true));

			const ids = (result.current.data ?? []).map((m) => m.id).sort();
			expect(ids).toEqual(['a', 'b']);
			expect(env.fake.api.getMemos).not.toHaveBeenCalled();
		} finally {
			env.engine.stop();
			env.db.close();
		}
	});

	it('after going online, SyncEngine drains the offline edit and the React Query cache reflects the server snapshot', async () => {
		const initial: ServerMemoSnapshot[] = [
			{
				id: 'm1',
				title: 'original',
				content: '<p>original</p>',
				tagIds: [],
				notebookId: null,
				createdAt: '2026-05-01T00:00:00.000Z',
				updatedAt: '2026-05-01T00:00:00.000Z',
				trashedAt: null,
			},
		];
		const env = await makeEnv({ initial, online: false });
		const { useMemos, useUpdateMemo } = await importHooks();

		try {
			const { result } = renderHook(
				() => ({
					list: useMemos(),
					update: useUpdateMemo(),
				}),
				{ wrapper: makeWrapper(queryClient) },
			);

			await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
			expect(result.current.list.data?.[0]?.title).toBe('original');

			// オフライン編集 → 保留キューに積まれる
			const outcome = await result.current.update.mutateAsync({
				id: 'm1',
				data: { title: 'edited offline', content: '<p>edited offline</p>' },
			});
			expect(outcome.kind).toBe('offline-saved');

			const pendingAfterEdit = await env.repo.listPending();
			expect(pendingAfterEdit.filter((p) => p.memoId === 'm1' && p.kind === 'update')).toHaveLength(
				1,
			);

			// オフライン中の refetch では、IDB の offline-saved な値が React Query キャッシュへ載る
			await act(async () => {
				await result.current.list.refetch();
			});
			await waitFor(() => {
				expect(result.current.list.data?.[0]?.title).toBe('edited offline');
			});

			// オンライン復帰 → SyncEngine が保留キューをドレイン
			env.setOnline(true);
			env.fake.setServerNow('2026-05-15T00:00:00.000Z');

			const drainResult = await env.engine.triggerDrainNow();
			expect(drainResult.kind).toBe('completed');
			if (drainResult.kind === 'completed') {
				expect(drainResult.succeeded).toBe(1);
				expect(drainResult.failed).toBe(0);
			}

			// サーバーに編集が反映 + 保留キューは空
			expect(env.fake.store.get('m1')?.title).toBe('edited offline');
			expect(await env.repo.listPending()).toHaveLength(0);

			// SyncEngine がローカルキャッシュも 'synced' に書き戻している
			const cachedAfter = await env.repo.getMemo('m1');
			expect(cachedAfter?.syncStatus).toBe('synced');
			expect(cachedAfter?.title).toBe('edited offline');

			// ドレイン後の refetch でサーバー版の updatedAt が React Query キャッシュへ反映される
			await act(async () => {
				await result.current.list.refetch();
			});
			await waitFor(() => {
				expect(result.current.list.data?.[0]?.title).toBe('edited offline');
				expect(result.current.list.data?.[0]?.updatedAt).toBe('2026-05-15T00:00:00.000Z');
			});
		} finally {
			env.engine.stop();
			env.db.close();
		}
	});
});

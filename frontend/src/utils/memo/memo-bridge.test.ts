import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';

import type { Memo } from '../../types/memo';
import { OFFLINE_DB_NAME, openOfflineDb } from '../offline/db';
import { OfflineMemoRepository } from '../offline/repository';
import { MemoBridge } from './memo-bridge';
import type { ApiClientLike } from './types';

const USER_ID = 'user-1';

function makeMemo(overrides: Partial<Memo> = {}): Memo {
	return {
		id: 'm1',
		title: 'hello',
		content: '<p>world</p>',
		createdAt: '2026-05-01T00:00:00.000Z',
		updatedAt: '2026-05-01T00:00:00.000Z',
		trashedAt: null,
		notebookId: null,
		...overrides,
	};
}

function makeApiMock(): ApiClientLike {
	return {
		getMemos: vi.fn(async () => [] as Memo[]),
		getMemo: vi.fn(async (id: string) => makeMemo({ id })),
		createMemo: vi.fn(async (data) => makeMemo({ id: 'created', ...data })),
		updateMemo: vi.fn(async (id, data) => makeMemo({ id, ...data })),
		deleteMemo: vi.fn(async (id: string) =>
			makeMemo({ id, trashedAt: '2026-05-02T00:00:00.000Z' }),
		),
		permanentDeleteMemo: vi.fn(async (id: string) => makeMemo({ id })),
		restoreMemo: vi.fn(async (id: string) => makeMemo({ id, trashedAt: null })),
		getTrashMemos: vi.fn(async () => [] as Memo[]),
		emptyTrash: vi.fn(async () => ({ count: 0 })),
		searchMemos: vi.fn(async () => [] as Memo[]),
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
}

async function makeBridge(opts: { online: boolean; api?: ApiClientLike }) {
	const { db } = await openOfflineDb();
	const repository = new OfflineMemoRepository({ db, getCurrentUserId: () => USER_ID });
	const api = opts.api ?? makeApiMock();
	const bridge = new MemoBridge({
		repository,
		api,
		isOnline: () => opts.online,
		now: () => new Date('2026-05-10T00:00:00.000Z'),
	});
	return { bridge, repository, db, api };
}

describe('MemoBridge — online', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});
	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('listMemos calls apiClient and persists the snapshot into IDB', async () => {
		const api = makeApiMock();
		api.getMemos = vi.fn(async () => [makeMemo({ id: 'a' }), makeMemo({ id: 'b' })]);
		const { bridge, repository, db } = await makeBridge({ online: true, api });
		try {
			const memos = await bridge.listMemos();
			expect(memos.map((m) => m.id)).toEqual(['a', 'b']);
			expect(api.getMemos).toHaveBeenCalledTimes(1);
			const cached = await repository.listMemos();
			expect(cached.map((m) => m.id).sort()).toEqual(['a', 'b']);
		} finally {
			db.close();
		}
	});

	it('updateMemo includes clientUpdatedAt and writes-through markSynced', async () => {
		const api = makeApiMock();
		api.updateMemo = vi.fn(async (id, data) =>
			makeMemo({ id, title: data.title ?? 'untouched', updatedAt: '2026-05-10T00:00:00.000Z' }),
		);
		const { bridge, repository, db } = await makeBridge({ online: true, api });
		try {
			const outcome = await bridge.updateMemo('m1', { title: 'new' });
			expect(outcome.kind).toBe('synced');
			expect(api.updateMemo).toHaveBeenCalledWith(
				'm1',
				expect.objectContaining({ title: 'new', clientUpdatedAt: expect.any(String) }),
			);
			const cached = await repository.getMemo('m1');
			expect(cached?.syncStatus).toBe('synced');
			expect(cached?.title).toBe('new');
		} finally {
			db.close();
		}
	});

	it('createMemo persists the new memo into IDB', async () => {
		const api = makeApiMock();
		api.createMemo = vi.fn(async (data) =>
			makeMemo({ id: 'new', title: data.title, content: data.content }),
		);
		const { bridge, repository, db } = await makeBridge({ online: true, api });
		try {
			const memo = await bridge.createMemo({ title: 't', content: '<p>c</p>' });
			expect(memo.id).toBe('new');
			expect(await repository.getMemo('new')).not.toBeNull();
		} finally {
			db.close();
		}
	});
});

describe('MemoBridge — offline', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});
	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('listMemos returns cached memos when offline (no API call)', async () => {
		const api = makeApiMock();
		const { bridge, repository, db } = await makeBridge({ online: false, api });
		try {
			await repository.upsertFromServer([
				{
					id: 'a',
					title: 'cached',
					content: '<p>x</p>',
					tagIds: [],
					notebookId: null,
					createdAt: '2026-05-01T00:00:00.000Z',
					updatedAt: '2026-05-01T00:00:00.000Z',
					trashedAt: null,
				},
			]);
			const memos = await bridge.listMemos();
			expect(memos.map((m) => m.id)).toEqual(['a']);
			expect(api.getMemos).not.toHaveBeenCalled();
		} finally {
			db.close();
		}
	});

	it('updateMemo enqueues an offline pending operation and returns offline-saved', async () => {
		const api = makeApiMock();
		const { bridge, repository, db } = await makeBridge({ online: false, api });
		try {
			await repository.upsertFromServer([
				{
					id: 'm1',
					title: 'original',
					content: '<p>original body</p>',
					tagIds: [],
					notebookId: null,
					createdAt: '2026-05-01T00:00:00.000Z',
					updatedAt: '2026-05-01T00:00:00.000Z',
					trashedAt: null,
				},
			]);

			const outcome = await bridge.updateMemo('m1', { title: 'edited', content: '<p>edited</p>' });

			expect(outcome.kind).toBe('offline-saved');
			expect(api.updateMemo).not.toHaveBeenCalled();
			const cached = await repository.getMemo('m1');
			expect(cached?.syncStatus).toBe('offline-saved');
			expect(cached?.title).toBe('edited');

			const pending = await repository.listPending();
			const updates = pending.filter((p) => p.memoId === 'm1' && p.kind === 'update');
			expect(updates).toHaveLength(1);
			expect(updates[0]?.patch?.title).toBe('edited');
		} finally {
			db.close();
		}
	});

	it('createMemo rejects when offline (per spec)', async () => {
		const { bridge, db } = await makeBridge({ online: false });
		try {
			await expect(bridge.createMemo({ title: 't', content: '' })).rejects.toThrow(/オフライン/);
		} finally {
			db.close();
		}
	});

	it('trashMemo enqueues a trash pending operation when offline', async () => {
		const api = makeApiMock();
		const { bridge, repository, db } = await makeBridge({ online: false, api });
		try {
			await repository.upsertFromServer([
				{
					id: 'm1',
					title: 'doomed',
					content: '<p>doomed body</p>',
					tagIds: [],
					notebookId: null,
					createdAt: '2026-05-01T00:00:00.000Z',
					updatedAt: '2026-05-01T00:00:00.000Z',
					trashedAt: null,
				},
			]);

			const outcome = await bridge.trashMemo('m1');
			expect(outcome.kind).toBe('offline-saved');
			expect(api.deleteMemo).not.toHaveBeenCalled();
			const cached = await repository.getMemo('m1');
			expect(cached?.trashedAt).toBeTruthy();
			const pending = await repository.listPending();
			expect(pending.some((p) => p.memoId === 'm1' && p.kind === 'trash')).toBe(true);
		} finally {
			db.close();
		}
	});
});

describe('MemoBridge — online with network failure', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});
	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('updateMemo falls back to offline-saved when the API throws a network error', async () => {
		const api = makeApiMock();
		api.updateMemo = vi.fn(async () => {
			throw new Error('ネットワークエラー: Failed to fetch');
		});
		const { bridge, repository, db } = await makeBridge({ online: true, api });
		try {
			await repository.upsertFromServer([
				{
					id: 'm1',
					title: 'pre',
					content: '<p>pre</p>',
					tagIds: [],
					notebookId: null,
					createdAt: '2026-05-01T00:00:00.000Z',
					updatedAt: '2026-05-01T00:00:00.000Z',
					trashedAt: null,
				},
			]);
			const outcome = await bridge.updateMemo('m1', { title: 'edited' });
			expect(outcome.kind).toBe('offline-saved');
			const pending = await repository.listPending();
			expect(pending).toHaveLength(1);
		} finally {
			db.close();
		}
	});

	it('updateMemo re-throws non-network errors (e.g. 4xx)', async () => {
		const api = makeApiMock();
		api.updateMemo = vi.fn(async () => {
			throw new Error('HTTP error! status: 400');
		});
		const { bridge, repository, db } = await makeBridge({ online: true, api });
		try {
			await repository.upsertFromServer([
				{
					id: 'm1',
					title: 't',
					content: '',
					tagIds: [],
					notebookId: null,
					createdAt: '2026-05-01T00:00:00.000Z',
					updatedAt: '2026-05-01T00:00:00.000Z',
					trashedAt: null,
				},
			]);
			await expect(bridge.updateMemo('m1', { title: 'x' })).rejects.toThrow(/HTTP error/);
		} finally {
			db.close();
		}
	});
});

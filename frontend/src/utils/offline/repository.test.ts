import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';
import type { JSONContent } from '@tiptap/react';

import {
	OFFLINE_DB_NAME,
	openOfflineDb,
	type CachedMemoRecord,
	type OfflineDB,
	type PendingOperationRecord,
} from './db';
import type { QuotaManager, QuotaSnapshot } from './quota';
import {
	OfflineMemoRepository,
	type OfflineRepositoryOptions,
	type OfflineRepositoryTelemetry,
	type ServerMemoSnapshot,
} from './repository';
import { extractPlainText } from '../editor/prosemirrorText';

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };
const HELLO_DOC: JSONContent = {
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }],
};

function createSnapshot(overrides: Partial<ServerMemoSnapshot> = {}): ServerMemoSnapshot {
	return {
		id: 'memo-1',
		title: 'Memo 1',
		content: EMPTY_DOC,
		tagIds: [],
		notebookId: null,
		createdAt: '2026-05-01T00:00:00.000Z',
		updatedAt: '2026-05-01T00:00:00.000Z',
		trashedAt: null,
		...overrides,
	};
}

function makeQuotaManagerSpy(): QuotaManager & {
	enforce: ReturnType<typeof vi.fn>;
	estimate: ReturnType<typeof vi.fn>;
} {
	const snapshot: QuotaSnapshot = {
		usageBytes: 0,
		quotaBytes: 50 * 1024 * 1024,
		maxEntries: 200,
		thresholdReached: false,
	};
	return {
		estimate: vi.fn(async () => snapshot),
		enforce: vi.fn(async () => ({ evicted: 0 })),
	} as QuotaManager & {
		enforce: ReturnType<typeof vi.fn>;
		estimate: ReturnType<typeof vi.fn>;
	};
}

async function makeRepo(
	overrides: Partial<OfflineRepositoryOptions> = {},
): Promise<{ repo: OfflineMemoRepository; db: OfflineDB }> {
	const { db } = await openOfflineDb();
	const repo = new OfflineMemoRepository({
		db,
		getCurrentUserId: () => USER_ID,
		...overrides,
	});
	return { repo, db };
}

describe('OfflineMemoRepository — read API', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('upsertFromServer derives searchableText from JSONContent', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([createSnapshot({ id: 'm1', content: HELLO_DOC })]);
			const stored = await db.get('memos', 'm1');
			expect(stored?.searchableText).toBe('hello world');
			expect(stored?.userId).toBe(USER_ID);
			expect(stored?.syncStatus).toBe('synced');
		} finally {
			db.close();
		}
	});

	it('listMemos returns only memos owned by the current user, sorted by updatedAt desc', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([
				createSnapshot({ id: 'm1', updatedAt: '2026-05-01T00:00:00.000Z' }),
				createSnapshot({ id: 'm3', updatedAt: '2026-05-03T00:00:00.000Z' }),
				createSnapshot({ id: 'm2', updatedAt: '2026-05-02T00:00:00.000Z' }),
			]);
			// 別ユーザーのメモを直接埋め込んで filter が効くことを確認する
			const tx = db.transaction('memos', 'readwrite');
			await tx.objectStore('memos').put({
				id: 'mx',
				userId: OTHER_USER_ID,
				title: 'foreign',
				content: EMPTY_DOC,
				searchableText: 'foreign',
				tagIds: [],
				notebookId: null,
				createdAt: '2026-05-04T00:00:00.000Z',
				updatedAt: '2026-05-04T00:00:00.000Z',
				trashedAt: null,
				syncStatus: 'synced',
			});
			await tx.done;

			const list = await repo.listMemos();
			expect(list.map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
		} finally {
			db.close();
		}
	});

	it('upsertFromServer が pinnedAt を保存し、listMemos がピン留めを先頭に返す', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([
				createSnapshot({ id: 'm1', updatedAt: '2026-05-03T00:00:00.000Z' }),
				createSnapshot({
					id: 'm2',
					updatedAt: '2026-05-01T00:00:00.000Z',
					pinnedAt: '2026-05-02T00:00:00.000Z',
				}),
			]);

			expect((await db.get('memos', 'm2'))?.pinnedAt).toBe('2026-05-02T00:00:00.000Z');
			// pinnedAt を持たないスナップショットは undefined ではなく null に正規化する
			expect((await db.get('memos', 'm1'))?.pinnedAt).toBeNull();

			// updatedAt では m1 が新しいが、ピン留めが優先される
			const list = await repo.listMemos();
			expect(list.map((m) => m.id)).toEqual(['m2', 'm1']);
		} finally {
			db.close();
		}
	});

	it('listMemos excludes trashed memos by default', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([
				createSnapshot({ id: 'm1' }),
				createSnapshot({ id: 'm2', trashedAt: '2026-05-05T00:00:00.000Z' }),
			]);
			const list = await repo.listMemos();
			expect(list.map((m) => m.id)).toEqual(['m1']);
		} finally {
			db.close();
		}
	});

	it('listMemos with notebookId filter returns matching memos', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([
				createSnapshot({ id: 'm1', notebookId: 'nb-A' }),
				createSnapshot({ id: 'm2', notebookId: 'nb-B' }),
				createSnapshot({ id: 'm3', notebookId: null }),
			]);
			const matched = await repo.listMemos({ notebookId: 'nb-A' });
			expect(matched.map((m) => m.id)).toEqual(['m1']);
			const noNotebook = await repo.listMemos({ notebookId: null });
			expect(noNotebook.map((m) => m.id)).toEqual(['m3']);
		} finally {
			db.close();
		}
	});

	it('listMemos with tagIds filter returns memos matching ANY of the requested tags', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([
				createSnapshot({ id: 'm1', tagIds: ['t-1'] }),
				createSnapshot({ id: 'm2', tagIds: ['t-2', 't-3'] }),
				createSnapshot({ id: 'm3', tagIds: [] }),
			]);
			const list = await repo.listMemos({ tagIds: ['t-3'] });
			expect(list.map((m) => m.id)).toEqual(['m2']);
		} finally {
			db.close();
		}
	});

	it('getMemo returns null for memos belonging to a different user', async () => {
		const { repo, db } = await makeRepo();
		try {
			const tx = db.transaction('memos', 'readwrite');
			await tx.objectStore('memos').put({
				id: 'mx',
				userId: OTHER_USER_ID,
				title: 'foreign',
				content: EMPTY_DOC,
				searchableText: '',
				tagIds: [],
				notebookId: null,
				createdAt: '2026-05-01T00:00:00.000Z',
				updatedAt: '2026-05-01T00:00:00.000Z',
				trashedAt: null,
				syncStatus: 'synced',
			});
			await tx.done;
			expect(await repo.getMemo('mx')).toBeNull();
			expect(await repo.getMemo('non-existent')).toBeNull();
		} finally {
			db.close();
		}
	});

	it('upsertFromServer protects offline-saved entries from being overwritten', async () => {
		const { repo, db } = await makeRepo();
		try {
			// 既存ローカル編集（offline-saved）を直接書き込む
			const tx = db.transaction('memos', 'readwrite');
			await tx.objectStore('memos').put({
				id: 'm1',
				userId: USER_ID,
				title: 'local edit',
				content: EMPTY_DOC,
				searchableText: 'local',
				tagIds: [],
				notebookId: null,
				createdAt: '2026-05-01T00:00:00.000Z',
				updatedAt: '2026-05-01T12:00:00.000Z',
				trashedAt: null,
				syncStatus: 'offline-saved',
			});
			await tx.done;

			// サーバー差分を upsert すると、未送信ローカル編集は上書きされない
			await repo.upsertFromServer([
				createSnapshot({
					id: 'm1',
					title: 'server version',
					updatedAt: '2026-05-01T10:00:00.000Z',
				}),
			]);

			const stored = await db.get('memos', 'm1');
			expect(stored?.title).toBe('local edit');
			expect(stored?.syncStatus).toBe('offline-saved');
		} finally {
			db.close();
		}
	});

	it('upsertFromServer triggers QuotaManager.enforce when one is supplied', async () => {
		const quotaManager = makeQuotaManagerSpy();
		const { repo, db } = await makeRepo({ quotaManager });
		try {
			await repo.upsertFromServer([createSnapshot({ id: 'm1' })]);
			expect(quotaManager.enforce).toHaveBeenCalledTimes(1);
			expect(quotaManager.enforce).toHaveBeenCalledWith(repo);
		} finally {
			db.close();
		}
	});

	it('throws a clear error when no current user is available', async () => {
		const { db } = await openOfflineDb();
		try {
			const repo = new OfflineMemoRepository({ db, getCurrentUserId: () => null });
			await expect(repo.listMemos()).rejects.toThrow(/current user/i);
		} finally {
			db.close();
		}
	});
});

function createMemoRecord(overrides: Partial<CachedMemoRecord> = {}): CachedMemoRecord {
	return {
		id: 'memo-1',
		userId: USER_ID,
		title: 'local title',
		content: EMPTY_DOC,
		searchableText: 'local body',
		tagIds: [],
		notebookId: null,
		createdAt: '2026-05-01T00:00:00.000Z',
		updatedAt: '2026-05-09T12:00:00.000Z',
		trashedAt: null,
		syncStatus: 'offline-saved',
		...overrides,
	};
}

function createPendingOperation(
	overrides: Partial<PendingOperationRecord> = {},
): PendingOperationRecord {
	return {
		memoId: 'memo-1',
		kind: 'update',
		patch: { title: 'local title', content: EMPTY_DOC },
		clientUpdatedAt: '2026-05-09T12:00:00.000Z',
		enqueuedAt: '2026-05-09T12:00:00.500Z',
		retryCount: 0,
		...overrides,
	};
}

describe('OfflineMemoRepository — saveLocal / pending queue', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('saveLocal persists the memo and getMemo returns the same content', async () => {
		const { repo, db } = await makeRepo();
		try {
			const result = await repo.saveLocal(createMemoRecord({ id: 'm1' }));
			expect(result.syncStatus).toBe('offline-saved');
			const stored = await repo.getMemo('m1');
			expect(stored?.title).toBe('local title');
		} finally {
			db.close();
		}
	});

	it('saveLocal rejects memos that do not belong to the current user', async () => {
		const { repo, db } = await makeRepo();
		try {
			await expect(
				repo.saveLocal(createMemoRecord({ id: 'm1', userId: OTHER_USER_ID })),
			).rejects.toThrow(/userId/i);
		} finally {
			db.close();
		}
	});

	it('enqueueOperation collapses duplicate (memoId, kind) entries into a single record', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.enqueueOperation(
				createPendingOperation({ enqueuedAt: '2026-05-09T12:00:00.000Z' }),
			);
			await repo.enqueueOperation(
				createPendingOperation({
					enqueuedAt: '2026-05-09T12:01:00.000Z',
					patch: { title: 'second edit' },
				}),
			);
			const pending = await repo.listPending();
			const updateOps = pending.filter((p) => p.memoId === 'memo-1' && p.kind === 'update');
			expect(updateOps).toHaveLength(1);
			expect(updateOps[0]?.patch?.title).toBe('second edit');
		} finally {
			db.close();
		}
	});

	it('enqueueOperation keeps separate entries for different kinds on the same memo', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.enqueueOperation(createPendingOperation({ kind: 'update' }));
			await repo.enqueueOperation(createPendingOperation({ kind: 'trash' }));
			const pending = await repo.listPending();
			const kinds = new Set(pending.filter((p) => p.memoId === 'memo-1').map((p) => p.kind));
			expect(kinds).toEqual(new Set(['update', 'trash']));
		} finally {
			db.close();
		}
	});

	it('enqueueOperation rejects an invalid clientUpdatedAt and emits a telemetry warning', async () => {
		const telemetry: OfflineRepositoryTelemetry & {
			warnInvalidIso8601: ReturnType<typeof vi.fn>;
		} = {
			warnInvalidIso8601: vi.fn(),
		};
		const { repo, db } = await makeRepo({ telemetry });
		try {
			await expect(
				repo.enqueueOperation(createPendingOperation({ clientUpdatedAt: 'not-a-timestamp' })),
			).rejects.toThrow(/clientUpdatedAt/i);
			expect(telemetry.warnInvalidIso8601).toHaveBeenCalledWith(
				expect.objectContaining({ memoId: 'memo-1', kind: 'update', value: 'not-a-timestamp' }),
			);
			const pending = await repo.listPending();
			expect(pending).toHaveLength(0);
		} finally {
			db.close();
		}
	});

	it('removePending deletes only the matching (memoId, kind) entry', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.enqueueOperation(createPendingOperation({ memoId: 'memo-1', kind: 'update' }));
			await repo.enqueueOperation(createPendingOperation({ memoId: 'memo-1', kind: 'trash' }));
			await repo.enqueueOperation(createPendingOperation({ memoId: 'memo-2', kind: 'update' }));

			await repo.removePending('memo-1', 'update');

			const remaining = await repo.listPending();
			expect(
				remaining
					.map((p) => ({ memoId: p.memoId, kind: p.kind }))
					.sort((a, b) => a.memoId.localeCompare(b.memoId)),
			).toEqual([
				{ memoId: 'memo-1', kind: 'trash' },
				{ memoId: 'memo-2', kind: 'update' },
			]);
		} finally {
			db.close();
		}
	});

	it('listPending returns entries sorted by enqueuedAt ascending', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.enqueueOperation(
				createPendingOperation({
					memoId: 'memo-A',
					enqueuedAt: '2026-05-09T12:00:00.300Z',
				}),
			);
			await repo.enqueueOperation(
				createPendingOperation({
					memoId: 'memo-B',
					enqueuedAt: '2026-05-09T12:00:00.100Z',
				}),
			);
			await repo.enqueueOperation(
				createPendingOperation({
					memoId: 'memo-C',
					enqueuedAt: '2026-05-09T12:00:00.200Z',
				}),
			);
			const pending = await repo.listPending();
			expect(pending.map((p) => p.memoId)).toEqual(['memo-B', 'memo-C', 'memo-A']);
		} finally {
			db.close();
		}
	});

	it('applyOfflineEdit writes memo and queue entry atomically and collapses prior queue entries', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.applyOfflineEdit({
				memo: createMemoRecord({ id: 'm1', title: 'first' }),
				operation: createPendingOperation({
					memoId: 'm1',
					kind: 'update',
					enqueuedAt: '2026-05-09T12:00:00.000Z',
					patch: { title: 'first' },
				}),
			});
			await repo.applyOfflineEdit({
				memo: createMemoRecord({ id: 'm1', title: 'second' }),
				operation: createPendingOperation({
					memoId: 'm1',
					kind: 'update',
					enqueuedAt: '2026-05-09T12:01:00.000Z',
					patch: { title: 'second' },
				}),
			});

			const memo = await repo.getMemo('m1');
			expect(memo?.title).toBe('second');
			expect(memo?.syncStatus).toBe('offline-saved');

			const pending = await repo.listPending();
			expect(pending.filter((p) => p.memoId === 'm1' && p.kind === 'update')).toHaveLength(1);
			expect(pending[0]?.patch?.title).toBe('second');
		} finally {
			db.close();
		}
	});

	it('applyOfflineEdit rejects when clientUpdatedAt is not ISO8601 with timezone', async () => {
		const telemetry: OfflineRepositoryTelemetry & {
			warnInvalidIso8601: ReturnType<typeof vi.fn>;
		} = {
			warnInvalidIso8601: vi.fn(),
		};
		const { repo, db } = await makeRepo({ telemetry });
		try {
			await expect(
				repo.applyOfflineEdit({
					memo: createMemoRecord({ id: 'm1' }),
					operation: createPendingOperation({
						memoId: 'm1',
						clientUpdatedAt: '2026-05-09T12:00:00',
					}),
				}),
			).rejects.toThrow(/clientUpdatedAt/i);
			expect(telemetry.warnInvalidIso8601).toHaveBeenCalled();
			// memo も書き込まれていないこと（アトミック保証）
			expect(await repo.getMemo('m1')).toBeNull();
			expect(await repo.listPending()).toHaveLength(0);
		} finally {
			db.close();
		}
	});
});

describe('OfflineMemoRepository — search', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('matches title case-insensitively and returns hits sorted by updatedAt desc', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([
				createSnapshot({
					id: 'm1',
					title: 'React Notes',
					updatedAt: '2026-05-01T00:00:00.000Z',
				}),
				createSnapshot({
					id: 'm2',
					title: 'Reactivity',
					updatedAt: '2026-05-03T00:00:00.000Z',
				}),
				createSnapshot({
					id: 'm3',
					title: 'Unrelated',
					updatedAt: '2026-05-04T00:00:00.000Z',
				}),
			]);
			const result = await repo.search('react');
			expect(result.outOfCacheRange).toBe(false);
			expect(result.hits.map((h) => h.memo.id)).toEqual(['m2', 'm1']);
		} finally {
			db.close();
		}
	});

	it('matches the searchable body text (JSON extracted) and returns a snippet around the match', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([
				createSnapshot({
					id: 'm1',
					title: 'plain title',
					content: {
						type: 'doc',
						content: [
							{
								type: 'paragraph',
								content: [
									{
										type: 'text',
										text: 'This is a long paragraph that mentions Workbox somewhere in the middle of the body text for testing snippet extraction.',
									},
								],
							},
						],
					},
				}),
			]);
			const result = await repo.search('workbox');
			expect(result.hits).toHaveLength(1);
			const snippet = result.hits[0]?.snippet ?? '';
			expect(snippet.toLowerCase()).toContain('workbox');
			// 前後コンテキストが付与されていること（クエリ単独ではない）
			expect(snippet.length).toBeGreaterThan('Workbox'.length);
		} finally {
			db.close();
		}
	});

	it('only returns memos owned by the current user', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([createSnapshot({ id: 'm1', title: 'shared keyword' })]);
			const tx = db.transaction('memos', 'readwrite');
			await tx.objectStore('memos').put({
				id: 'mx',
				userId: OTHER_USER_ID,
				title: 'shared keyword',
				content: EMPTY_DOC,
				searchableText: 'foreign shared keyword',
				tagIds: [],
				notebookId: null,
				createdAt: '2026-05-01T00:00:00.000Z',
				updatedAt: '2026-05-01T00:00:00.000Z',
				trashedAt: null,
				syncStatus: 'synced',
			});
			await tx.done;

			const result = await repo.search('shared');
			expect(result.hits.map((h) => h.memo.id)).toEqual(['m1']);
		} finally {
			db.close();
		}
	});

	it('excludes trashed memos from search hits', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([
				createSnapshot({
					id: 'm1',
					title: 'keep me',
					content: {
						type: 'doc',
						content: [
							{ type: 'paragraph', content: [{ type: 'text', text: 'visible content here' }] },
						],
					},
				}),
				createSnapshot({
					id: 'm2',
					title: 'visible too',
					trashedAt: '2026-05-05T00:00:00.000Z',
				}),
			]);
			const result = await repo.search('visible');
			expect(result.hits.map((h) => h.memo.id)).toEqual(['m1']);
		} finally {
			db.close();
		}
	});

	it('returns outOfCacheRange=true when query is non-empty and no local match is found', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([createSnapshot({ id: 'm1', title: 'apple' })]);
			const result = await repo.search('banana');
			expect(result.hits).toEqual([]);
			expect(result.outOfCacheRange).toBe(true);
		} finally {
			db.close();
		}
	});

	it('returns no hits and outOfCacheRange=false when query is empty', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([createSnapshot({ id: 'm1' })]);
			const result = await repo.search('');
			expect(result.hits).toEqual([]);
			expect(result.outOfCacheRange).toBe(false);
		} finally {
			db.close();
		}
	});

	it('completes a 200-memo full-text search well under the 300ms target', async () => {
		const { repo, db } = await makeRepo();
		try {
			const snapshots = Array.from({ length: 200 }, (_, i) =>
				createSnapshot({
					id: `m${i.toString().padStart(3, '0')}`,
					title: `Memo ${i}`,
					content: {
						type: 'doc',
						content: [
							{
								type: 'paragraph',
								content: [
									{
										type: 'text',
										text: `${'lorem ipsum dolor sit amet '.repeat(20)}${i === 137 ? 'PerformanceTargetToken ' : ''}consectetur adipiscing elit.`,
									},
								],
							},
						],
					},
					updatedAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
				}),
			);
			await repo.upsertFromServer(snapshots);

			const t0 = performance.now();
			const result = await repo.search('PerformanceTargetToken');
			const elapsed = performance.now() - t0;

			expect(result.hits.map((h) => h.memo.id)).toEqual(['m137']);
			expect(elapsed).toBeLessThan(300);
		} finally {
			db.close();
		}
	});
});

describe('OfflineMemoRepository — owner scoping & purge', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	async function seedForeignMemo(
		db: OfflineDB,
		params: { id: string; userId: string },
	): Promise<void> {
		const tx = db.transaction('memos', 'readwrite');
		await tx.objectStore('memos').put({
			id: params.id,
			userId: params.userId,
			title: `memo of ${params.userId}`,
			content: EMPTY_DOC,
			searchableText: params.id,
			tagIds: [],
			notebookId: null,
			createdAt: '2026-05-01T00:00:00.000Z',
			updatedAt: '2026-05-01T00:00:00.000Z',
			trashedAt: null,
			syncStatus: 'synced',
		});
		await tx.done;
	}

	it('purgeForUser removes memos, pending operations, and user-specific meta for the target user', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([createSnapshot({ id: 'm1' }), createSnapshot({ id: 'm2' })]);
			await repo.enqueueOperation(createPendingOperation({ memoId: 'm1', kind: 'update' }));
			await repo.enqueueOperation(createPendingOperation({ memoId: 'm2', kind: 'trash' }));
			await db.put('meta', { key: 'currentUserId', value: USER_ID });

			await repo.purgeForUser(USER_ID);

			const memos = await db.getAll('memos');
			expect(memos.filter((m) => m.userId === USER_ID)).toHaveLength(0);

			const remainingPending = await db.getAll('pending_operations');
			expect(remainingPending).toHaveLength(0);

			const currentUserMeta = await db.get('meta', 'currentUserId');
			expect(currentUserMeta).toBeUndefined();
		} finally {
			db.close();
		}
	});

	it('purgeForUser leaves data for other users intact', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([createSnapshot({ id: 'm1' })]);
			await seedForeignMemo(db, { id: 'mx', userId: OTHER_USER_ID });

			await repo.purgeForUser(USER_ID);

			const remaining = await db.getAll('memos');
			expect(remaining.map((m) => m.id)).toEqual(['mx']);
		} finally {
			db.close();
		}
	});

	it('verifyOwnerOrPurge stores the current user when meta is empty (first launch)', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.verifyOwnerOrPurge(USER_ID);
			const meta = await db.get('meta', 'currentUserId');
			expect(meta?.value).toBe(USER_ID);
		} finally {
			db.close();
		}
	});

	it('verifyOwnerOrPurge keeps existing data when the stored user matches', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([createSnapshot({ id: 'm1' })]);
			await db.put('meta', { key: 'currentUserId', value: USER_ID });

			await repo.verifyOwnerOrPurge(USER_ID);

			const memo = await db.get('memos', 'm1');
			expect(memo).toBeDefined();
			const meta = await db.get('meta', 'currentUserId');
			expect(meta?.value).toBe(USER_ID);
		} finally {
			db.close();
		}
	});

	it('verifyOwnerOrPurge purges previous user data and stores the new user when mismatched', async () => {
		const { db } = await openOfflineDb();
		try {
			// 旧ユーザーのデータを直接シード（前回セッションの残骸）
			await seedForeignMemo(db, { id: 'mx', userId: OTHER_USER_ID });
			const tx = db.transaction('pending_operations', 'readwrite');
			await tx.objectStore('pending_operations').add({
				memoId: 'mx',
				kind: 'update',
				patch: { title: 't' },
				clientUpdatedAt: '2026-05-09T12:00:00.000Z',
				enqueuedAt: '2026-05-09T12:00:00.000Z',
				retryCount: 0,
			});
			await tx.done;
			await db.put('meta', { key: 'currentUserId', value: OTHER_USER_ID });

			const repo = new OfflineMemoRepository({
				db,
				getCurrentUserId: () => USER_ID,
			});
			await repo.verifyOwnerOrPurge(USER_ID);

			expect(await db.get('memos', 'mx')).toBeUndefined();
			expect(await db.getAll('pending_operations')).toHaveLength(0);
			const meta = await db.get('meta', 'currentUserId');
			expect(meta?.value).toBe(USER_ID);
		} finally {
			db.close();
		}
	});
});

describe('OfflineMemoRepository — markSynced / evictById', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('markSynced はサーバースナップショットを synced 状態で保存し既存の offline-saved を上書きする', async () => {
		const { repo, db } = await makeRepo();
		try {
			const initial: CachedMemoRecord = {
				id: 'memo-1',
				userId: USER_ID,
				title: 'old-local',
				content: EMPTY_DOC,
				searchableText: 'old',
				tagIds: [],
				notebookId: null,
				createdAt: '2026-05-01T00:00:00.000Z',
				updatedAt: '2026-05-01T00:00:00.000Z',
				trashedAt: null,
				syncStatus: 'offline-saved',
			};
			await repo.saveLocal(initial);

			const freshDoc: JSONContent = {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'fresh' }] }],
			};
			const updated = await repo.markSynced({
				id: 'memo-1',
				title: 'server-version',
				content: freshDoc,
				tagIds: ['tag-a'],
				notebookId: null,
				createdAt: '2026-05-01T00:00:00.000Z',
				updatedAt: '2026-05-02T00:00:00.000Z',
				trashedAt: null,
			});

			expect(updated.title).toBe('server-version');
			expect(updated.syncStatus).toBe('synced');
			expect(updated.searchableText).toBe('fresh');

			const reloaded = await repo.getMemo('memo-1');
			expect(reloaded?.title).toBe('server-version');
			expect(reloaded?.syncStatus).toBe('synced');
		} finally {
			db.close();
		}
	});

	it('evictById は対象メモを削除する。他ユーザー所有のメモは触らない', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.saveLocal({
				id: 'mine',
				userId: USER_ID,
				title: 'mine',
				content: EMPTY_DOC,
				searchableText: '',
				tagIds: [],
				notebookId: null,
				createdAt: '2026-05-01T00:00:00.000Z',
				updatedAt: '2026-05-01T00:00:00.000Z',
				trashedAt: null,
				syncStatus: 'synced',
			});
			await db.put('memos', {
				id: 'others',
				userId: OTHER_USER_ID,
				title: 'others',
				content: EMPTY_DOC,
				searchableText: '',
				tagIds: [],
				notebookId: null,
				createdAt: '2026-05-01T00:00:00.000Z',
				updatedAt: '2026-05-01T00:00:00.000Z',
				trashedAt: null,
				syncStatus: 'synced',
			});

			await repo.evictById('mine');
			await repo.evictById('others');

			expect(await db.get('memos', 'mine')).toBeUndefined();
			expect(await db.get('memos', 'others')).toBeDefined();
		} finally {
			db.close();
		}
	});
});

describe('OfflineMemoRepository — statsForDebug', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});
	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('返り値に cachedCount と pendingCount を含む', async () => {
		const { repo, db } = await makeRepo();
		try {
			const stats = await repo.statsForDebug();
			expect(stats).toMatchObject({ cachedCount: 0, pendingCount: 0 });
		} finally {
			db.close();
		}
	});

	it('現在ログイン中ユーザーのキャッシュ件数のみを cachedCount に数える', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.upsertFromServer([
				createSnapshot({ id: 'm1' }),
				createSnapshot({ id: 'm2' }),
				createSnapshot({ id: 'm3' }),
			]);
			await db.put('memos', {
				id: 'foreign',
				userId: OTHER_USER_ID,
				title: 'other user',
				content: EMPTY_DOC,
				searchableText: '',
				tagIds: [],
				notebookId: null,
				createdAt: '2026-05-01T00:00:00.000Z',
				updatedAt: '2026-05-01T00:00:00.000Z',
				trashedAt: null,
				syncStatus: 'synced',
			});

			const stats = await repo.statsForDebug();
			expect(stats.cachedCount).toBe(3);
		} finally {
			db.close();
		}
	});

	it('pendingCount は pending_operations の件数', async () => {
		const { repo, db } = await makeRepo();
		try {
			const op: PendingOperationRecord = {
				memoId: 'm1',
				kind: 'update',
				patch: { title: 'updated' },
				clientUpdatedAt: '2026-05-01T00:00:00.000Z',
				enqueuedAt: '2026-05-01T00:00:00.000Z',
				retryCount: 0,
			};
			await repo.enqueueOperation(op);
			await repo.enqueueOperation({ ...op, memoId: 'm2', kind: 'trash' });

			const stats = await repo.statsForDebug();
			expect(stats.pendingCount).toBe(2);
		} finally {
			db.close();
		}
	});

	it('quotaSnapshot は quotaManager が提供されている場合に含まれる', async () => {
		const quotaManager = makeQuotaManagerSpy();
		const { repo, db } = await makeRepo({ quotaManager });
		try {
			const stats = await repo.statsForDebug();
			expect(quotaManager.estimate).toHaveBeenCalled();
			expect(stats.quotaSnapshot).toBeDefined();
			expect(stats.quotaSnapshot?.quotaBytes).toBeGreaterThan(0);
		} finally {
			db.close();
		}
	});

	it('quotaManager が無ければ quotaSnapshot は undefined', async () => {
		const { repo, db } = await makeRepo();
		try {
			const stats = await repo.statsForDebug();
			expect(stats.quotaSnapshot).toBeUndefined();
		} finally {
			db.close();
		}
	});
});

/**
 * rich-editor-blocks Task 9.3: オフライン層（IndexedDB 保存・検索）が4機能（コールアウト・
 * テキスト色/マーカー・表・トグル）を含む本文 JSON を欠損なく保存・同期・検索できることを
 * 固定する（Req8.1〜8.4）。content は JSON パススルー、searchableText は extractPlainText
 * （Task 9.2 で4機能への追随を固定済み）に依存するため、実装変更なしにテストのみを追加する。
 */
describe('OfflineMemoRepository — 4機能の追随（Task 9.3 / Req8.1〜8.4）', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	const RICH_DOC: JSONContent = {
		type: 'doc',
		content: [
			{
				type: 'callout',
				attrs: { variant: 'warning' },
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'オフライン注意事項' }] }],
			},
			{
				type: 'table',
				content: [
					{
						type: 'tableRow',
						content: [
							{
								type: 'tableCell',
								content: [
									{
										type: 'paragraph',
										content: [
											{
												type: 'text',
												text: 'セル本文',
												marks: [{ type: 'textStyle', attrs: { textColor: 'sumire' } }],
											},
										],
									},
								],
							},
						],
					},
				],
			},
			{
				type: 'details',
				content: [
					{ type: 'detailsSummary', content: [{ type: 'text', text: 'サマリー' }] },
					{
						type: 'detailsContent',
						content: [{ type: 'paragraph', content: [{ type: 'text', text: '折りたたみ本文' }] }],
					},
				],
			},
		],
	};

	it('オフライン編集（applyOfflineEdit）で本文 JSON が欠損なくローカル保存される（Req8.1）', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.applyOfflineEdit({
				memo: createMemoRecord({
					id: 'm1',
					content: RICH_DOC,
					searchableText: extractPlainText(RICH_DOC),
				}),
				operation: createPendingOperation({ memoId: 'm1', patch: { content: RICH_DOC } }),
			});

			const stored = await repo.getMemo('m1');
			expect(stored?.content).toEqual(RICH_DOC);
		} finally {
			db.close();
		}
	});

	it('接続回復時の同期（markSynced）でも4機能を含む本文が欠損なく反映される（Req8.2）', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.applyOfflineEdit({
				memo: createMemoRecord({
					id: 'm1',
					content: RICH_DOC,
					searchableText: extractPlainText(RICH_DOC),
				}),
				operation: createPendingOperation({ memoId: 'm1', patch: { content: RICH_DOC } }),
			});

			const synced = await repo.markSynced(createSnapshot({ id: 'm1', content: RICH_DOC }));
			expect(synced.content).toEqual(RICH_DOC);
			expect(synced.syncStatus).toBe('synced');

			const stored = await repo.getMemo('m1');
			expect(stored?.content).toEqual(RICH_DOC);
			expect(stored?.syncStatus).toBe('synced');
		} finally {
			db.close();
		}
	});

	it('オフライン検索の対象テキストに4機能のノード内テキストが含まれる（Req8.3）', async () => {
		const { repo, db } = await makeRepo();
		try {
			await repo.saveLocal(
				createMemoRecord({
					id: 'm1',
					title: 'リッチメモ',
					content: RICH_DOC,
					searchableText: extractPlainText(RICH_DOC),
				}),
			);

			const calloutHit = await repo.search('オフライン注意事項');
			expect(calloutHit.hits.map((h) => h.memo.id)).toEqual(['m1']);

			const tableHit = await repo.search('セル本文');
			expect(tableHit.hits.map((h) => h.memo.id)).toEqual(['m1']);

			const detailsSummaryHit = await repo.search('サマリー');
			expect(detailsSummaryHit.hits.map((h) => h.memo.id)).toEqual(['m1']);

			const detailsContentHit = await repo.search('折りたたみ本文');
			expect(detailsContentHit.hits.map((h) => h.memo.id)).toEqual(['m1']);
		} finally {
			db.close();
		}
	});

	it('オフライン保存されたメモの再表示（getMemo）で4機能が編集時と同一構造に復元される（Req8.4）', async () => {
		const { repo, db } = await makeRepo();
		try {
			const saved = await repo.saveLocal(
				createMemoRecord({
					id: 'm1',
					content: RICH_DOC,
					searchableText: extractPlainText(RICH_DOC),
				}),
			);

			const reloaded = await repo.getMemo('m1');
			expect(reloaded?.content).toEqual(saved.content);
			expect(reloaded?.content).toEqual(RICH_DOC);
		} finally {
			db.close();
		}
	});
});

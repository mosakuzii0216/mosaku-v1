import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';

import { OFFLINE_DB_NAME, openOfflineDb, type CachedMemoRecord, type OfflineDB } from './db';
import {
	DefaultQuotaManager,
	QUOTA_BYTES_PER_ENTRY,
	QUOTA_DEFAULT_BYTES,
	QUOTA_DEFAULT_MAX_ENTRIES,
	QUOTA_DEFAULT_THRESHOLD_BYTES,
	QUOTA_THRESHOLD_RATIO,
	type StorageEstimateLike,
} from './quota';
import { OfflineMemoRepository } from './repository';

const USER_ID = 'user-1';

function createMemoRecord(overrides: Partial<CachedMemoRecord> = {}): CachedMemoRecord {
	return {
		id: 'memo-1',
		userId: USER_ID,
		title: 'memo',
		content: '<p>body</p>',
		searchableText: 'body',
		tagIds: [],
		notebookId: null,
		createdAt: '2026-05-01T00:00:00.000Z',
		updatedAt: '2026-05-01T00:00:00.000Z',
		trashedAt: null,
		syncStatus: 'synced',
		...overrides,
	};
}

async function withDb<T>(fn: (db: OfflineDB) => Promise<T>): Promise<T> {
	const { db } = await openOfflineDb();
	try {
		return await fn(db);
	} finally {
		db.close();
	}
}

describe('DefaultQuotaManager — estimate', () => {
	it('falls back to fixed defaults when getStorageEstimate throws', async () => {
		const manager = new DefaultQuotaManager({
			getStorageEstimate: vi.fn(async () => {
				throw new Error('not supported');
			}),
		});
		const snapshot = await manager.estimate();
		expect(snapshot.quotaBytes).toBe(QUOTA_DEFAULT_BYTES);
		expect(snapshot.maxEntries).toBe(QUOTA_DEFAULT_MAX_ENTRIES);
		expect(snapshot.usageBytes).toBe(0);
		expect(snapshot.thresholdReached).toBe(false);
	});

	it('falls back to fixed defaults when getStorageEstimate returns null/undefined fields', async () => {
		const manager = new DefaultQuotaManager({
			getStorageEstimate: vi.fn(async () => ({}) as StorageEstimateLike),
		});
		const snapshot = await manager.estimate();
		expect(snapshot.quotaBytes).toBe(QUOTA_DEFAULT_BYTES);
		expect(snapshot.maxEntries).toBe(QUOTA_DEFAULT_MAX_ENTRIES);
	});

	it('uses the default max entries when the reported quota is at or above 100 MB', async () => {
		const manager = new DefaultQuotaManager({
			getStorageEstimate: vi.fn(async () => ({
				usage: 10 * 1024 * 1024,
				quota: 500 * 1024 * 1024,
			})),
		});
		const snapshot = await manager.estimate();
		expect(snapshot.quotaBytes).toBe(500 * 1024 * 1024);
		expect(snapshot.usageBytes).toBe(10 * 1024 * 1024);
		expect(snapshot.maxEntries).toBe(QUOTA_DEFAULT_MAX_ENTRIES);
		expect(snapshot.thresholdReached).toBe(false);
	});

	it('derives maxEntries from quota (floor(quota / 250KB)) when the reported quota is below 100 MB', async () => {
		const quotaBytes = 50 * 1024 * 1024; // 50 MB → floor(50MB / 250KB) = 204
		const manager = new DefaultQuotaManager({
			getStorageEstimate: vi.fn(async () => ({ usage: 0, quota: quotaBytes })),
		});
		const snapshot = await manager.estimate();
		expect(snapshot.quotaBytes).toBe(quotaBytes);
		expect(snapshot.maxEntries).toBe(Math.floor(quotaBytes / QUOTA_BYTES_PER_ENTRY));
	});

	it('shrinks maxEntries well below the default when quota is severely constrained', async () => {
		const quotaBytes = 10 * 1024 * 1024; // 10 MB → floor(10MB / 250KB) = 40
		const manager = new DefaultQuotaManager({
			getStorageEstimate: vi.fn(async () => ({ usage: 0, quota: quotaBytes })),
		});
		const snapshot = await manager.estimate();
		expect(snapshot.maxEntries).toBe(Math.floor(quotaBytes / QUOTA_BYTES_PER_ENTRY));
		expect(snapshot.maxEntries).toBeLessThan(QUOTA_DEFAULT_MAX_ENTRIES);
	});

	it('marks thresholdReached when usage is at or above 80% of quota', async () => {
		const quotaBytes = QUOTA_DEFAULT_THRESHOLD_BYTES * 2; // 200 MB
		const manager = new DefaultQuotaManager({
			getStorageEstimate: vi.fn(async () => ({
				usage: Math.ceil(quotaBytes * QUOTA_THRESHOLD_RATIO),
				quota: quotaBytes,
			})),
		});
		const snapshot = await manager.estimate();
		expect(snapshot.thresholdReached).toBe(true);
	});

	it('does not mark thresholdReached when usage is well below 80%', async () => {
		const quotaBytes = QUOTA_DEFAULT_THRESHOLD_BYTES * 2;
		const manager = new DefaultQuotaManager({
			getStorageEstimate: vi.fn(async () => ({
				usage: Math.floor(quotaBytes * 0.5),
				quota: quotaBytes,
			})),
		});
		const snapshot = await manager.estimate();
		expect(snapshot.thresholdReached).toBe(false);
	});
});

describe('DefaultQuotaManager — enforce', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});
	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('invokes onThresholdReached when the snapshot threshold is reached', async () => {
		const onThresholdReached = vi.fn();
		const quotaBytes = QUOTA_DEFAULT_THRESHOLD_BYTES * 2;
		const manager = new DefaultQuotaManager({
			getStorageEstimate: vi.fn(async () => ({
				usage: Math.ceil(quotaBytes * QUOTA_THRESHOLD_RATIO),
				quota: quotaBytes,
			})),
			onThresholdReached,
		});
		await withDb(async (db) => {
			const repository = new OfflineMemoRepository({ db, getCurrentUserId: () => USER_ID });
			await manager.enforce(repository);
		});
		expect(onThresholdReached).toHaveBeenCalledTimes(1);
		const snapshot = onThresholdReached.mock.calls[0]?.[0];
		expect(snapshot.thresholdReached).toBe(true);
	});

	it('does not invoke onThresholdReached when usage is below the threshold', async () => {
		const onThresholdReached = vi.fn();
		const manager = new DefaultQuotaManager({
			getStorageEstimate: vi.fn(async () => ({ usage: 0, quota: 500 * 1024 * 1024 })),
			onThresholdReached,
		});
		await withDb(async (db) => {
			const repository = new OfflineMemoRepository({ db, getCurrentUserId: () => USER_ID });
			await manager.enforce(repository);
		});
		expect(onThresholdReached).not.toHaveBeenCalled();
	});

	it('delegates eviction to repository.evictOldestSynced with the snapshot maxEntries', async () => {
		const manager = new DefaultQuotaManager({
			getStorageEstimate: vi.fn(async () => ({ usage: 0, quota: 500 * 1024 * 1024 })),
		});
		await withDb(async (db) => {
			const repository = new OfflineMemoRepository({ db, getCurrentUserId: () => USER_ID });
			const evictSpy = vi.spyOn(repository, 'evictOldestSynced').mockResolvedValue(3);
			const result = await manager.enforce(repository);
			expect(evictSpy).toHaveBeenCalledWith(QUOTA_DEFAULT_MAX_ENTRIES);
			expect(result.evicted).toBe(3);
		});
	});
});

describe('OfflineMemoRepository.evictOldestSynced (Task 3.2)', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});
	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	async function seedMemos(db: OfflineDB, records: ReadonlyArray<CachedMemoRecord>): Promise<void> {
		const tx = db.transaction('memos', 'readwrite');
		for (const record of records) {
			await tx.objectStore('memos').put(record);
		}
		await tx.done;
	}

	it('removes oldest synced memos when the total exceeds keep', async () => {
		await withDb(async (db) => {
			const repository = new OfflineMemoRepository({ db, getCurrentUserId: () => USER_ID });
			await seedMemos(db, [
				createMemoRecord({ id: 'm1', updatedAt: '2026-05-01T00:00:00.000Z' }),
				createMemoRecord({ id: 'm2', updatedAt: '2026-05-02T00:00:00.000Z' }),
				createMemoRecord({ id: 'm3', updatedAt: '2026-05-03T00:00:00.000Z' }),
				createMemoRecord({ id: 'm4', updatedAt: '2026-05-04T00:00:00.000Z' }),
			]);
			const evicted = await repository.evictOldestSynced(2);
			expect(evicted).toBe(2);
			const remaining = await db.getAll('memos');
			expect(remaining.map((m) => m.id).sort()).toEqual(['m3', 'm4']);
		});
	});

	it('returns 0 when current count is already at or below keep', async () => {
		await withDb(async (db) => {
			const repository = new OfflineMemoRepository({ db, getCurrentUserId: () => USER_ID });
			await seedMemos(db, [
				createMemoRecord({ id: 'm1', updatedAt: '2026-05-01T00:00:00.000Z' }),
				createMemoRecord({ id: 'm2', updatedAt: '2026-05-02T00:00:00.000Z' }),
			]);
			const evicted = await repository.evictOldestSynced(5);
			expect(evicted).toBe(0);
			const remaining = await db.getAll('memos');
			expect(remaining).toHaveLength(2);
		});
	});

	it('never evicts memos with syncStatus="offline-saved" even if they are the oldest', async () => {
		await withDb(async (db) => {
			const repository = new OfflineMemoRepository({ db, getCurrentUserId: () => USER_ID });
			await seedMemos(db, [
				createMemoRecord({
					id: 'offline-old',
					updatedAt: '2026-05-01T00:00:00.000Z',
					syncStatus: 'offline-saved',
				}),
				createMemoRecord({
					id: 'synced-old',
					updatedAt: '2026-05-02T00:00:00.000Z',
					syncStatus: 'synced',
				}),
				createMemoRecord({
					id: 'synced-new',
					updatedAt: '2026-05-05T00:00:00.000Z',
					syncStatus: 'synced',
				}),
			]);
			const evicted = await repository.evictOldestSynced(2);
			expect(evicted).toBe(1);
			const remaining = await db.getAll('memos');
			const ids = remaining.map((m) => m.id).sort();
			expect(ids).toContain('offline-old');
			expect(ids).toContain('synced-new');
			expect(ids).not.toContain('synced-old');
		});
	});

	it('returns the number of memos that could actually be evicted (offline-saved hard cap)', async () => {
		await withDb(async (db) => {
			const repository = new OfflineMemoRepository({ db, getCurrentUserId: () => USER_ID });
			await seedMemos(db, [
				createMemoRecord({
					id: 'o1',
					updatedAt: '2026-05-01T00:00:00.000Z',
					syncStatus: 'offline-saved',
				}),
				createMemoRecord({
					id: 'o2',
					updatedAt: '2026-05-02T00:00:00.000Z',
					syncStatus: 'offline-saved',
				}),
				createMemoRecord({
					id: 's1',
					updatedAt: '2026-05-03T00:00:00.000Z',
					syncStatus: 'synced',
				}),
			]);
			// keep=1 だが、offline-saved 2 件は退避できないため、退避できるのは synced 1 件のみ
			const evicted = await repository.evictOldestSynced(1);
			expect(evicted).toBe(1);
			const ids = (await db.getAll('memos')).map((m) => m.id).sort();
			expect(ids).toEqual(['o1', 'o2']);
		});
	});

	it('does not touch memos owned by other users', async () => {
		await withDb(async (db) => {
			const repository = new OfflineMemoRepository({ db, getCurrentUserId: () => USER_ID });
			await seedMemos(db, [
				createMemoRecord({ id: 'mine-1', updatedAt: '2026-05-01T00:00:00.000Z' }),
				createMemoRecord({ id: 'mine-2', updatedAt: '2026-05-02T00:00:00.000Z' }),
				createMemoRecord({
					id: 'foreign-1',
					userId: 'other-user',
					updatedAt: '2026-04-01T00:00:00.000Z',
				}),
			]);
			const evicted = await repository.evictOldestSynced(1);
			expect(evicted).toBe(1);
			const ids = (await db.getAll('memos')).map((m) => m.id).sort();
			expect(ids).toEqual(['foreign-1', 'mine-2']);
		});
	});
});

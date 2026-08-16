import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB, openDB } from 'idb';

import { OFFLINE_DB_NAME, OFFLINE_DB_VERSION, openOfflineDb } from './db';

async function resetDb(): Promise<void> {
	await deleteDB(OFFLINE_DB_NAME);
}

describe('openOfflineDb', () => {
	beforeEach(async () => {
		await resetDb();
	});

	afterEach(async () => {
		await resetDb();
	});

	it('opens a fresh DB containing all required object stores on first call', async () => {
		const { db, recovered } = await openOfflineDb();
		try {
			expect(recovered).toBe(false);
			expect(db.objectStoreNames.contains('memos')).toBe(true);
			expect(db.objectStoreNames.contains('pending_operations')).toBe(true);
			expect(db.objectStoreNames.contains('meta')).toBe(true);
		} finally {
			db.close();
		}
	});

	it('declares byUser / byUpdatedAt / byNotebook indexes on the memos store', async () => {
		const { db } = await openOfflineDb();
		try {
			const tx = db.transaction('memos', 'readonly');
			const indexNames = Array.from(tx.objectStore('memos').indexNames);
			await tx.done;
			expect(indexNames).toEqual(expect.arrayContaining(['byUser', 'byUpdatedAt', 'byNotebook']));
		} finally {
			db.close();
		}
	});

	it('declares byMemoId / byEnqueuedAt indexes on pending_operations and uses autoIncrement keys', async () => {
		const { db } = await openOfflineDb();
		try {
			const tx = db.transaction('pending_operations', 'readonly');
			const store = tx.objectStore('pending_operations');
			const indexNames = Array.from(store.indexNames);
			await tx.done;
			expect(indexNames).toEqual(expect.arrayContaining(['byMemoId', 'byEnqueuedAt']));
			expect(store.autoIncrement).toBe(true);
		} finally {
			db.close();
		}
	});

	it('uses key as the keyPath of the meta store', async () => {
		const { db } = await openOfflineDb();
		try {
			const tx = db.transaction('meta', 'readonly');
			expect(tx.objectStore('meta').keyPath).toBe('key');
			await tx.done;
		} finally {
			db.close();
		}
	});

	it('reopens an existing healthy DB without triggering recovery', async () => {
		const first = await openOfflineDb();
		first.db.close();
		const second = await openOfflineDb();
		try {
			expect(second.recovered).toBe(false);
		} finally {
			second.db.close();
		}
	});

	it('rebuilds DB by deleteDB → reopen when stored schema is missing required stores', async () => {
		// 既存環境に "壊れた" v1 DB があるケースを再現する。同一バージョンの再 open
		// では upgrade コールバックが走らないため、verifyStructure 経由でのリカバリ
		// 経路を踏ませる必要がある。
		const corrupt = await openDB(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains('memos')) {
					db.createObjectStore('memos', { keyPath: 'id' });
				}
				// pending_operations / meta を意図的に作成しない
			},
		});
		corrupt.close();

		const { db, recovered } = await openOfflineDb();
		try {
			expect(recovered).toBe(true);
			expect(db.objectStoreNames.contains('memos')).toBe(true);
			expect(db.objectStoreNames.contains('pending_operations')).toBe(true);
			expect(db.objectStoreNames.contains('meta')).toBe(true);
		} finally {
			db.close();
		}
	});
});

/**
 * E2E から IndexedDB の `mosaku-offline` を直接覗く / 操作するユーティリティ。
 *
 * オフライン編集後の保留キューが期待通り増えているか、
 * 再オンライン後にキューが空になったかをアサートするために使用する。
 *
 * Playwright の page.evaluate 内で実行され、ブラウザ側コンテキストで動く。
 */

import type { Page } from '@playwright/test';

const DB_NAME = 'mosaku-offline';
const DB_VERSION = 1;

export interface PendingSnapshot {
	memoId: string;
	kind: 'update' | 'trash' | 'permanentDelete';
	clientUpdatedAt: string;
}

export async function getPendingOperations(page: Page): Promise<PendingSnapshot[]> {
	return page.evaluate(
		async ({ dbName, dbVersion }) => {
			return new Promise<PendingSnapshot[]>((resolve, reject) => {
				const open = indexedDB.open(dbName, dbVersion);
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					try {
						const tx = db.transaction('pending_operations', 'readonly');
						const req = tx.objectStore('pending_operations').getAll();
						req.onerror = () => reject(req.error);
						req.onsuccess = () => resolve(req.result as unknown as PendingSnapshot[]);
					} catch (err) {
						reject(err);
					}
				};
			});
		},
		{ dbName: DB_NAME, dbVersion: DB_VERSION },
	);
}

export async function getCachedMemoCount(page: Page): Promise<number> {
	return page.evaluate(
		async ({ dbName, dbVersion }) => {
			return new Promise<number>((resolve, reject) => {
				const open = indexedDB.open(dbName, dbVersion);
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const tx = db.transaction('memos', 'readonly');
					const req = tx.objectStore('memos').count();
					req.onerror = () => reject(req.error);
					req.onsuccess = () => resolve(req.result);
				};
			});
		},
		{ dbName: DB_NAME, dbVersion: DB_VERSION },
	);
}

export async function getCachedMemoContent(page: Page, memoId: string): Promise<string | null> {
	return page.evaluate(
		async ({ dbName, dbVersion, id }) => {
			return new Promise<string | null>((resolve, reject) => {
				const open = indexedDB.open(dbName, dbVersion);
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					try {
						const tx = db.transaction('memos', 'readonly');
						const req = tx.objectStore('memos').get(id);
						req.onerror = () => reject(req.error);
						req.onsuccess = () => {
							const record = req.result as { content?: string } | undefined;
							resolve(record?.content ?? null);
						};
					} catch {
						resolve(null);
					}
				};
			});
		},
		{ dbName: DB_NAME, dbVersion: DB_VERSION, id: memoId },
	);
}

export async function clearOfflineDb(page: Page): Promise<void> {
	await page.evaluate(
		async ({ dbName }) => {
			return new Promise<void>((resolve, reject) => {
				const req = indexedDB.deleteDatabase(dbName);
				req.onerror = () => reject(req.error);
				req.onsuccess = () => resolve();
				req.onblocked = () => resolve();
			});
		},
		{ dbName: DB_NAME },
	);
}

/** pending_operations のみクリアして memos キャッシュは残す。 */
export async function clearPendingQueue(page: Page): Promise<void> {
	await page.evaluate(
		async ({ dbName, dbVersion }) => {
			return new Promise<void>((resolve, reject) => {
				const open = indexedDB.open(dbName, dbVersion);
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					try {
						const tx = db.transaction('pending_operations', 'readwrite');
						const req = tx.objectStore('pending_operations').clear();
						req.onerror = () => reject(req.error);
						req.onsuccess = () => resolve();
					} catch {
						resolve();
					}
				};
			});
		},
		{ dbName: DB_NAME, dbVersion: DB_VERSION },
	);
}

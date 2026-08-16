/**
 * E2E から IndexedDB の `mosaku-offline` を直接覗く / 操作するユーティリティ。
 *
 * オフライン編集後の保留キューが期待通り増えているか、
 * 再オンライン後にキューが空になったかをアサートするために使用する。
 *
 * Playwright の page.evaluate 内で実行され、ブラウザ側コンテキストで動く。
 *
 * バージョンは指定せずに open する（`indexedDB.open(name)` は既存 DB を現行バージョンで開く）。
 * ヘルパー側にバージョン番号を焼き込むと `src/utils/offline/db.ts` の
 * OFFLINE_DB_VERSION を上げた瞬間に VersionError で全テストが落ちるため、
 * スキーマ更新に追従不要な形にしている。
 */

import type { Page } from '@playwright/test';

const DB_NAME = 'mosaku-offline';

export interface PendingSnapshot {
	memoId: string;
	kind: 'update' | 'trash' | 'permanentDelete';
	clientUpdatedAt: string;
}

export async function getPendingOperations(page: Page): Promise<PendingSnapshot[]> {
	return page.evaluate(
		async ({ dbName }) => {
			return new Promise<PendingSnapshot[]>((resolve, reject) => {
				const open = indexedDB.open(dbName);
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					if (!db.objectStoreNames.contains('pending_operations')) {
						resolve([]);
						return;
					}
					const tx = db.transaction('pending_operations', 'readonly');
					const req = tx.objectStore('pending_operations').getAll();
					req.onerror = () => reject(req.error);
					req.onsuccess = () => resolve(req.result as unknown as PendingSnapshot[]);
				};
			});
		},
		{ dbName: DB_NAME },
	);
}

export async function getCachedMemoCount(page: Page): Promise<number> {
	return page.evaluate(
		async ({ dbName }) => {
			return new Promise<number>((resolve, reject) => {
				const open = indexedDB.open(dbName);
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					if (!db.objectStoreNames.contains('memos')) {
						resolve(0);
						return;
					}
					const tx = db.transaction('memos', 'readonly');
					const req = tx.objectStore('memos').count();
					req.onerror = () => reject(req.error);
					req.onsuccess = () => resolve(req.result);
				};
			});
		},
		{ dbName: DB_NAME },
	);
}

export async function getCachedMemoContent(page: Page, memoId: string): Promise<string | null> {
	return page.evaluate(
		async ({ dbName, id }) => {
			return new Promise<string | null>((resolve, reject) => {
				const open = indexedDB.open(dbName);
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					if (!db.objectStoreNames.contains('memos')) {
						resolve(null);
						return;
					}
					const tx = db.transaction('memos', 'readonly');
					const req = tx.objectStore('memos').get(id);
					req.onerror = () => reject(req.error);
					req.onsuccess = () => {
						const record = req.result as { content?: string } | undefined;
						resolve(record?.content ?? null);
					};
				};
			});
		},
		{ dbName: DB_NAME, id: memoId },
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
		async ({ dbName }) => {
			return new Promise<void>((resolve, reject) => {
				const open = indexedDB.open(dbName);
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					if (!db.objectStoreNames.contains('pending_operations')) {
						resolve();
						return;
					}
					const tx = db.transaction('pending_operations', 'readwrite');
					const req = tx.objectStore('pending_operations').clear();
					req.onerror = () => reject(req.error);
					req.onsuccess = () => resolve();
				};
			});
		},
		{ dbName: DB_NAME },
	);
}

import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { JSONContent } from '@tiptap/react';

export const OFFLINE_DB_NAME = 'mosaku-offline';
export const OFFLINE_DB_VERSION = 2;

export type SyncStatus = 'synced' | 'offline-saved';

export type SyncOperationKind = 'update' | 'trash' | 'permanentDelete';

export interface CachedMemoRecord {
	id: string;
	userId: string;
	title: string;
	content: JSONContent;
	searchableText: string;
	tagIds: string[];
	notebookId: string | null;
	createdAt: string;
	updatedAt: string;
	trashedAt: string | null;
	/** ピン留め日時。v2 以前に保存されたレコードには存在しないため optional。 */
	pinnedAt?: string | null;
	syncStatus: SyncStatus;
}

export interface PendingOperationPatch {
	title?: string;
	content?: JSONContent;
	notebookId?: string | null;
}

export interface PendingOperationRecord {
	memoId: string;
	kind: SyncOperationKind;
	patch?: PendingOperationPatch;
	clientUpdatedAt: string;
	enqueuedAt: string;
	retryCount: number;
}

export interface MetaRecord {
	key: string;
	value: unknown;
}

export interface OfflineDBSchema extends DBSchema {
	memos: {
		key: string;
		value: CachedMemoRecord;
		indexes: {
			byUser: string;
			byUpdatedAt: string;
			byNotebook: string;
		};
	};
	pending_operations: {
		key: number;
		value: PendingOperationRecord;
		indexes: {
			byMemoId: string;
			byEnqueuedAt: string;
		};
	};
	meta: {
		key: string;
		value: MetaRecord;
	};
}

export type OfflineDB = IDBPDatabase<OfflineDBSchema>;

export interface OpenOfflineDbResult {
	db: OfflineDB;
	recovered: boolean;
}

const REQUIRED_STORES = ['memos', 'pending_operations', 'meta'] as const;

function createMemosStore(db: IDBPDatabase<OfflineDBSchema>) {
	const memos = db.createObjectStore('memos', { keyPath: 'id' });
	memos.createIndex('byUser', 'userId');
	memos.createIndex('byUpdatedAt', 'updatedAt');
	memos.createIndex('byNotebook', 'notebookId');
}

async function openWithSchema(): Promise<OfflineDB> {
	return openDB<OfflineDBSchema>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
		upgrade(db, oldVersion) {
			if (oldVersion === 0) {
				// 新規インストール: 全ストアを作成
				createMemosStore(db);
				const pending = db.createObjectStore('pending_operations', { autoIncrement: true });
				pending.createIndex('byMemoId', 'memoId');
				pending.createIndex('byEnqueuedAt', 'enqueuedAt');
				db.createObjectStore('meta', { keyPath: 'key' });
			} else if (oldVersion === 1) {
				// v1 → v2: content が HTML 文字列から JSONContent に変わるため
				// memos ストアをクリアして再構築（server から再取得で補完）
				if (db.objectStoreNames.contains('memos')) {
					db.deleteObjectStore('memos');
				}
				createMemosStore(db);
			}
		},
	});
}

function verifyStructure(db: OfflineDB): boolean {
	for (const name of REQUIRED_STORES) {
		if (!db.objectStoreNames.contains(name)) return false;
	}
	return true;
}

export async function openOfflineDb(): Promise<OpenOfflineDbResult> {
	try {
		const db = await openWithSchema();
		if (verifyStructure(db)) {
			return { db, recovered: false };
		}
		db.close();
		await deleteDB(OFFLINE_DB_NAME);
		const rebuilt = await openWithSchema();
		return { db: rebuilt, recovered: true };
	} catch {
		await deleteDB(OFFLINE_DB_NAME);
		const rebuilt = await openWithSchema();
		return { db: rebuilt, recovered: true };
	}
}

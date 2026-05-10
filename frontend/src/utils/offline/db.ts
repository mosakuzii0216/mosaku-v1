import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const OFFLINE_DB_NAME = 'mosaku-offline';
export const OFFLINE_DB_VERSION = 1;

export type SyncStatus = 'synced' | 'offline-saved';

export type SyncOperationKind = 'update' | 'trash' | 'permanentDelete';

export interface CachedMemoRecord {
	id: string;
	userId: string;
	title: string;
	content: string;
	searchableText: string;
	tagIds: string[];
	notebookId: string | null;
	createdAt: string;
	updatedAt: string;
	trashedAt: string | null;
	syncStatus: SyncStatus;
}

export interface PendingOperationPatch {
	title?: string;
	content?: string;
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

async function openWithSchema(): Promise<OfflineDB> {
	return openDB<OfflineDBSchema>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains('memos')) {
				const memos = db.createObjectStore('memos', { keyPath: 'id' });
				memos.createIndex('byUser', 'userId');
				memos.createIndex('byUpdatedAt', 'updatedAt');
				memos.createIndex('byNotebook', 'notebookId');
			}
			if (!db.objectStoreNames.contains('pending_operations')) {
				const pending = db.createObjectStore('pending_operations', { autoIncrement: true });
				pending.createIndex('byMemoId', 'memoId');
				pending.createIndex('byEnqueuedAt', 'enqueuedAt');
			}
			if (!db.objectStoreNames.contains('meta')) {
				db.createObjectStore('meta', { keyPath: 'key' });
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

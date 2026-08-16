import { AuthTokenManager } from '../auth';

import { openOfflineDb, type OfflineDB, type OpenOfflineDbResult } from './db';
import { DefaultQuotaManager, type QuotaManager } from './quota';
import { OfflineMemoRepository } from './repository';

export interface OfflineRepositoryHandle {
	repository: OfflineMemoRepository;
	db: OfflineDB;
	quotaManager: QuotaManager;
	ready: Promise<OpenOfflineDbResult>;
}

function getCurrentUserId(): string | null {
	const token = AuthTokenManager.getAccessToken();
	if (!token || AuthTokenManager.isTokenExpired(token)) return null;
	const payload = AuthTokenManager.getTokenPayload(token);
	return payload?.sub ?? null;
}

let handle: OfflineRepositoryHandle | null = null;

export function getOfflineRepository(): OfflineRepositoryHandle {
	if (handle) return handle;

	const quotaManager = new DefaultQuotaManager();
	let resolvedDb: OfflineDB | null = null;

	const ready: Promise<OpenOfflineDbResult> = openOfflineDb().then((result) => {
		resolvedDb = result.db;
		return result;
	});

	const proxyDb = new Proxy(
		{},
		{
			get(_target, prop) {
				if (!resolvedDb) {
					throw new Error('OfflineRepository: underlying IDB is not yet open; await `ready` first');
				}
				const value = (resolvedDb as unknown as Record<PropertyKey, unknown>)[prop];
				return typeof value === 'function'
					? (value as (...args: unknown[]) => unknown).bind(resolvedDb)
					: value;
			},
		},
	) as OfflineDB;

	const repository = new OfflineMemoRepository({
		db: proxyDb,
		getCurrentUserId,
		quotaManager,
	});

	handle = {
		repository,
		db: proxyDb,
		quotaManager,
		ready,
	};
	return handle;
}

export function resetOfflineRepositoryForTest(): void {
	handle = null;
}

import { logger } from '../logger';

const LEGACY_API_CACHE_NAME = 'api-cache';

export async function purgeLegacyApiCache(cachesApi?: CacheStorage): Promise<{ deleted: boolean }> {
	const api = cachesApi ?? (typeof caches !== 'undefined' ? caches : undefined);
	if (!api) return { deleted: false };
	try {
		const has = await api.has(LEGACY_API_CACHE_NAME);
		if (!has) return { deleted: false };
		const removed = await api.delete(LEGACY_API_CACHE_NAME);
		return { deleted: removed };
	} catch (err) {
		logger.warn('[pwa] failed to purge legacy api-cache', err);
		return { deleted: false };
	}
}

import { describe, expect, it, vi } from 'vitest';
import { purgeLegacyApiCache } from './cache-cleanup';

function createFakeCaches(initial: string[] = []): CacheStorage & {
	keys: ReturnType<typeof vi.fn>;
	has: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
} {
	const store = new Set(initial);
	return {
		keys: vi.fn(async () => Array.from(store)),
		has: vi.fn(async (key: string) => store.has(key)),
		delete: vi.fn(async (key: string) => store.delete(key)),
		match: vi.fn(),
		open: vi.fn(),
	} as unknown as CacheStorage & {
		keys: ReturnType<typeof vi.fn>;
		has: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
	};
}

describe('purgeLegacyApiCache', () => {
	it('deletes the legacy "api-cache" entry when present and reports deleted=true', async () => {
		const cachesApi = createFakeCaches(['api-cache', 'mosaku-theme-css']);
		const result = await purgeLegacyApiCache(cachesApi);
		expect(result.deleted).toBe(true);
		expect(cachesApi.delete).toHaveBeenCalledWith('api-cache');
		expect(cachesApi.delete).not.toHaveBeenCalledWith('mosaku-theme-css');
	});

	it('reports deleted=false and skips delete() when "api-cache" is not present', async () => {
		const cachesApi = createFakeCaches(['mosaku-theme-css']);
		const result = await purgeLegacyApiCache(cachesApi);
		expect(result.deleted).toBe(false);
		expect(cachesApi.delete).not.toHaveBeenCalled();
	});

	it('returns deleted=false gracefully when CacheStorage API is unavailable', async () => {
		const result = await purgeLegacyApiCache(undefined);
		expect(result.deleted).toBe(false);
	});

	it('does not throw when caches.delete rejects (best-effort cleanup)', async () => {
		const cachesApi = createFakeCaches(['api-cache']);
		(cachesApi.delete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error('quota exceeded'),
		);
		await expect(purgeLegacyApiCache(cachesApi)).resolves.toEqual({ deleted: false });
	});
});

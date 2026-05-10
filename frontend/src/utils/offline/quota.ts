import type { OfflineMemoRepository } from './repository';

export interface QuotaSnapshot {
	usageBytes: number;
	quotaBytes: number;
	maxEntries: number;
	thresholdReached: boolean;
}

export interface QuotaManager {
	estimate(): Promise<QuotaSnapshot>;
	enforce(repository: OfflineMemoRepository): Promise<{ evicted: number }>;
}

export type StorageEstimateLike = { usage?: number; quota?: number };

export interface QuotaManagerOptions {
	getStorageEstimate?: () => Promise<StorageEstimateLike | null | undefined>;
	onThresholdReached?: (snapshot: QuotaSnapshot) => void;
}

export const QUOTA_DEFAULT_BYTES = 50 * 1024 * 1024;
export const QUOTA_DEFAULT_MAX_ENTRIES = 200;
export const QUOTA_DEFAULT_THRESHOLD_BYTES = 100 * 1024 * 1024;
export const QUOTA_BYTES_PER_ENTRY = 250 * 1024;
export const QUOTA_THRESHOLD_RATIO = 0.8;

function defaultGetStorageEstimate(): Promise<StorageEstimateLike | null> {
	if (
		typeof navigator !== 'undefined' &&
		navigator.storage &&
		typeof navigator.storage.estimate === 'function'
	) {
		return navigator.storage.estimate();
	}
	return Promise.resolve(null);
}

export class DefaultQuotaManager implements QuotaManager {
	private readonly opts: QuotaManagerOptions;

	constructor(opts: QuotaManagerOptions = {}) {
		this.opts = opts;
	}

	async estimate(): Promise<QuotaSnapshot> {
		const fallback: QuotaSnapshot = {
			usageBytes: 0,
			quotaBytes: QUOTA_DEFAULT_BYTES,
			maxEntries: QUOTA_DEFAULT_MAX_ENTRIES,
			thresholdReached: false,
		};
		let raw: StorageEstimateLike | null | undefined;
		try {
			raw = await (this.opts.getStorageEstimate ?? defaultGetStorageEstimate)();
		} catch {
			return fallback;
		}
		if (!raw || typeof raw.quota !== 'number' || typeof raw.usage !== 'number') {
			return fallback;
		}
		const { quota: quotaBytes, usage: usageBytes } = raw;
		const maxEntries =
			quotaBytes < QUOTA_DEFAULT_THRESHOLD_BYTES
				? Math.max(0, Math.floor(quotaBytes / QUOTA_BYTES_PER_ENTRY))
				: QUOTA_DEFAULT_MAX_ENTRIES;
		const thresholdReached = usageBytes >= quotaBytes * QUOTA_THRESHOLD_RATIO;
		return { usageBytes, quotaBytes, maxEntries, thresholdReached };
	}

	async enforce(repository: OfflineMemoRepository): Promise<{ evicted: number }> {
		const snapshot = await this.estimate();
		if (snapshot.thresholdReached) {
			this.opts.onThresholdReached?.(snapshot);
		}
		const evicted = await repository.evictOldestSynced(snapshot.maxEntries);
		return { evicted };
	}
}

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

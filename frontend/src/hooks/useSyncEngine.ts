import { useEffect, useState } from 'react';

import { getSyncEngine } from '../utils/sync/instance';
import type { SyncEngine } from '../utils/sync/sync-engine';
import type { SyncEvent } from '../utils/sync/types';

export interface UseSyncEngineResult {
	pendingCount: number;
	lastSyncAt: string | null;
	lastEvent: SyncEvent | null;
	isRunning: boolean;
	isLeader: boolean;
	triggerDrainNow: SyncEngine['triggerDrainNow'];
}

export function useSyncEngine(): UseSyncEngineResult {
	const engine = getSyncEngine();
	const [pendingCount, setPendingCount] = useState<number>(() => engine.getPendingCount());
	const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => engine.getLastSyncAt());
	const [lastEvent, setLastEvent] = useState<SyncEvent | null>(null);

	useEffect(() => {
		const unsubscribe = engine.subscribe((event) => {
			setLastEvent(event);
			if (event.type === 'pending-changed') {
				setPendingCount(event.count);
			}
			if (event.type === 'cycle-complete') {
				setPendingCount(engine.getPendingCount());
				setLastSyncAt(engine.getLastSyncAt());
			}
		});
		return unsubscribe;
	}, [engine]);

	return {
		pendingCount,
		lastSyncAt,
		lastEvent,
		isRunning: engine.isRunning(),
		isLeader: engine.isLeader(),
		triggerDrainNow: engine.triggerDrainNow.bind(engine),
	};
}

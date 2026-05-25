import { useNetworkStatusStore } from '../../stores/useNetworkStatusStore';
import { apiClient } from '../api';
import { getOfflineRepository } from '../offline/instance';
import { getSyncEngine } from '../sync/instance';

import { MemoBridge } from './memo-bridge';

let bridgeInstance: MemoBridge | null = null;

export function getMemoBridge(): MemoBridge {
	if (bridgeInstance) return bridgeInstance;
	bridgeInstance = new MemoBridge({
		repository: getOfflineRepository().repository,
		api: apiClient,
		isOnline: () => useNetworkStatusStore.getState().status === 'online',
		onPendingChanged: () => getSyncEngine().notifyEnqueueChanged(),
	});
	return bridgeInstance;
}

export function resetMemoBridgeForTest(): void {
	bridgeInstance = null;
}

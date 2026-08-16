import { create } from 'zustand';

export type NetworkStatus = 'online' | 'unstable' | 'offline';

export interface NetworkStatusState {
	status: NetworkStatus;
	lastChangeAt: string;
	setStatus: (next: NetworkStatus) => void;
}

const createInitialState = (): Pick<NetworkStatusState, 'status' | 'lastChangeAt'> => ({
	status: 'unstable',
	lastChangeAt: new Date().toISOString(),
});

export const useNetworkStatusStore = create<NetworkStatusState>((set, get) => ({
	...createInitialState(),
	setStatus: (next) => {
		if (get().status === next) return;
		set({ status: next, lastChangeAt: new Date().toISOString() });
	},
}));

export function resetNetworkStatusForTest(): void {
	useNetworkStatusStore.setState(createInitialState());
}

export function subscribeWindowNetworkEvents(): () => void {
	const handleOnline = () => useNetworkStatusStore.getState().setStatus('online');
	const handleOffline = () => useNetworkStatusStore.getState().setStatus('offline');

	window.addEventListener('online', handleOnline);
	window.addEventListener('offline', handleOffline);

	return () => {
		window.removeEventListener('online', handleOnline);
		window.removeEventListener('offline', handleOffline);
	};
}

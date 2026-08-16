import { useNetworkStatusStore, type NetworkStatus } from '../stores/useNetworkStatusStore';

export interface UseNetworkStatusResult {
	status: NetworkStatus;
	lastChangeAt: string;
	isOnline: boolean;
	isOffline: boolean;
	isUnstable: boolean;
}

export function useNetworkStatus(): UseNetworkStatusResult {
	const status = useNetworkStatusStore((s) => s.status);
	const lastChangeAt = useNetworkStatusStore((s) => s.lastChangeAt);

	return {
		status,
		lastChangeAt,
		isOnline: status === 'online',
		isOffline: status === 'offline',
		isUnstable: status === 'unstable',
	};
}

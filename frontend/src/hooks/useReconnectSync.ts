import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNetworkStatusStore } from '../stores/useNetworkStatusStore';
import { startReconnectRefetch } from '../utils/sync/reconnect-refetch';
import { getSyncEngine } from '../utils/sync/instance';
import type { QueryKey } from '@tanstack/react-query';

export function useReconnectSync(): void {
	const queryClient = useQueryClient();
	const initializedRef = useRef(false);

	useEffect(() => {
		if (initializedRef.current) return;
		initializedRef.current = true;

		const runner = startReconnectRefetch({
			subscribe: (listener) =>
				useNetworkStatusStore.subscribe((state, prev) => listener(state.status, prev.status)),
			getStatus: () => useNetworkStatusStore.getState().status,
			invalidate: (keys: readonly QueryKey[]) => {
				keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key as QueryKey[] }));
				getSyncEngine()
					.triggerDrainNow()
					.catch(() => {});
			},
		});

		return () => {
			runner.stop();
		};
	}, [queryClient]);
}

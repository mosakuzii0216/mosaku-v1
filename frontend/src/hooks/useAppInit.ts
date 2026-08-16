import { useEffect, useRef } from 'react';

import { useAppReadyStore } from '../stores/useAppReadyStore';
import {
	subscribeWindowNetworkEvents,
	useNetworkStatusStore,
} from '../stores/useNetworkStatusStore';
import { AuthTokenManager } from '../utils/auth';
import { apiClient } from '../utils/api';
import { startHeartbeatRunner } from '../utils/offline/heartbeat';
import { getOfflineRepository } from '../utils/offline/instance';
import { getSyncEngine } from '../utils/sync/instance';

import { useTagQueries } from './useTagQueries';

function getCurrentUserIdFromToken(): string | null {
	const token = AuthTokenManager.getAccessToken();
	if (!token || AuthTokenManager.isTokenExpired(token)) return null;
	const payload = AuthTokenManager.getTokenPayload(token);
	return payload?.sub ?? null;
}

export interface UseAppInitResult {
	isReady: boolean;
	isLoading: boolean;
	error: Error | null;
	pendingCountOnBoot: number;
}

export const useAppInit = (): UseAppInitResult => {
	const { tagsQuery } = useTagQueries();
	const initialized = useRef(false);
	const status = useAppReadyStore((s) => s.status);
	const pendingCountOnBoot = useAppReadyStore((s) => s.pendingCountOnBoot);
	const storedError = useAppReadyStore((s) => s.error);

	useEffect(() => {
		if (initialized.current) return;
		initialized.current = true;

		let cancelled = false;
		let unsubscribeNetwork: (() => void) | null = null;
		let heartbeatStop: (() => void) | null = null;
		let engineStarted = false;

		(async () => {
			try {
				const handle = getOfflineRepository();
				await handle.ready;

				const userId = getCurrentUserIdFromToken();
				if (userId) {
					await handle.repository.verifyOwnerOrPurge(userId);
				}

				unsubscribeNetwork = subscribeWindowNetworkEvents();
				heartbeatStop = startHeartbeatRunner({
					ping: async () => {
						await apiClient.health();
					},
					setStatus: (next) => useNetworkStatusStore.getState().setStatus(next),
					isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
					onVisibilityChange: (cb) => {
						if (typeof document === 'undefined') return () => undefined;
						const handler = () => cb();
						document.addEventListener('visibilitychange', handler);
						return () => document.removeEventListener('visibilitychange', handler);
					},
				}).stop;

				const engine = getSyncEngine();
				await engine.start();
				engineStarted = true;

				const pending = await handle.repository.listPending();
				if (!cancelled) {
					useAppReadyStore.getState().setReady(pending.length);
				}
			} catch (err) {
				if (!cancelled) {
					const error = err instanceof Error ? err : new Error(String(err));
					useAppReadyStore.getState().setError(error);
				}
			}
		})();

		// 既存仕様: 起動時のタグロード
		void tagsQuery.refetch();

		return () => {
			cancelled = true;
			if (heartbeatStop) {
				heartbeatStop();
				heartbeatStop = null;
			}
			if (unsubscribeNetwork) {
				unsubscribeNetwork();
				unsubscribeNetwork = null;
			}
			if (engineStarted) {
				getSyncEngine().stop();
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return {
		isReady: status === 'ready',
		isLoading: status === 'booting' || tagsQuery.isLoading,
		error: storedError ?? (tagsQuery.error as Error | null),
		pendingCountOnBoot,
	};
};

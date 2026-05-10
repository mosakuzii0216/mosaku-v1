import { useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { purgeLegacyApiCache } from '../utils/pwa/cache-cleanup';
import { logger } from '../utils/logger';

export interface UseSwRegistrationResult {
	needRefresh: boolean;
	offlineReady: boolean;
	update: () => Promise<void>;
	dismiss: () => void;
}

export function useSwRegistration(): UseSwRegistrationResult {
	const {
		needRefresh: [needRefresh, setNeedRefresh],
		offlineReady: [offlineReady, setOfflineReady],
		updateServiceWorker,
	} = useRegisterSW({
		onRegisteredSW: () => {
			void purgeLegacyApiCache();
		},
		onRegisterError: (err) => {
			logger.error('[pwa] service worker registration failed', err);
		},
	});

	const update = useCallback(() => updateServiceWorker(true), [updateServiceWorker]);

	const dismiss = useCallback(() => {
		setNeedRefresh(false);
		setOfflineReady(false);
	}, [setNeedRefresh, setOfflineReady]);

	return { needRefresh, offlineReady, update, dismiss };
}

import { useCallback, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { logger } from '../utils/logger';
import { purgeLegacyApiCache } from '../utils/pwa/cache-cleanup';

export interface UseSwRegistrationResult {
	/** 新しい SW が waiting に到達し、有効化可能になったか */
	updateAvailable: boolean;
	/**
	 * skipWaiting + reload を実行する。内部で updateServiceWorker(true) に委譲。
	 * 呼び出しは useGuardedAutoUpdate の one-shot ガード下でのみ行う。
	 */
	applyUpdate: () => Promise<void>;
}

/** 定期/フォーカス probe の間隔（ミリ秒）。公式推奨に倣い 60 分。 */
export const SW_UPDATE_PROBE_INTERVAL_MS = 60 * 60 * 1000;

type RegistrationContext = {
	swUrl: string;
	registration: ServiceWorkerRegistration;
};

export function useSwRegistration(): UseSwRegistrationResult {
	const [registered, setRegistered] = useState<RegistrationContext | null>(null);

	const {
		needRefresh: [updateAvailable],
		updateServiceWorker,
	} = useRegisterSW({
		onRegisteredSW: (swUrl: string, registration?: ServiceWorkerRegistration) => {
			void purgeLegacyApiCache();
			if (registration) {
				setRegistered({ swUrl, registration });
			}
		},
		onRegisterError: (err) => {
			logger.error('[pwa] service worker registration failed', err);
		},
	});

	const applyUpdate = useCallback(() => updateServiceWorker(true), [updateServiceWorker]);

	// 定期/フォーカス probe のセットアップ (Req 3.2, 3.3)
	useEffect(() => {
		if (!registered) return;
		const { swUrl, registration } = registered;

		const probe = async () => {
			if (registration.installing || !navigator.onLine) return;
			try {
				const response = await fetch(swUrl, { cache: 'no-store' });
				if (response.ok) {
					await registration.update();
				}
			} catch {
				// ネットワークエラーは次サイクルで再試行
			}
		};

		const intervalId = setInterval(() => void probe(), SW_UPDATE_PROBE_INTERVAL_MS);

		const onVisibilityChange = () => {
			if (document.visibilityState === 'visible') void probe();
		};
		const onFocus = () => void probe();

		document.addEventListener('visibilitychange', onVisibilityChange);
		window.addEventListener('focus', onFocus);

		return () => {
			clearInterval(intervalId);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			window.removeEventListener('focus', onFocus);
		};
	}, [registered]);

	return { updateAvailable, applyUpdate };
}

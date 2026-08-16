import type { QueryKey } from '@tanstack/react-query';
import type { NetworkStatus } from '../../stores/useNetworkStatusStore';
import { queryKeys } from '../../constants/queryKeys';

export interface ReconnectRefetchOptions {
	subscribe: (listener: (status: NetworkStatus, prevStatus: NetworkStatus) => void) => () => void;
	getStatus: () => NetworkStatus;
	invalidate: (keys: readonly QueryKey[]) => void;
	targetKeys?: readonly QueryKey[];
	cooldownMs?: number;
	now?: () => number;
}

export interface ReconnectRefetcher {
	stop(): void;
}

const DEFAULT_TARGET_KEYS: readonly QueryKey[] = [
	queryKeys.memos.all,
	queryKeys.notebooks.all,
	queryKeys.tags.all,
	queryKeys.dashboard.recentMemos(),
];

const DEFAULT_COOLDOWN_MS = 2000;

export function startReconnectRefetch(options: ReconnectRefetchOptions): ReconnectRefetcher {
	const targetKeys = options.targetKeys ?? DEFAULT_TARGET_KEYS;
	const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
	const now = options.now ?? (() => Date.now());

	let lastFiredAt: number | null = null;

	const tryFire = (): void => {
		const currentTime = now();
		if (lastFiredAt !== null && currentTime - lastFiredAt < cooldownMs) {
			return;
		}
		lastFiredAt = currentTime;
		options.invalidate(targetKeys);
	};

	// マウント遅延レース救済: start() 時に既に online なら初回 reconcile を発火
	if (options.getStatus() === 'online') {
		tryFire();
	}

	const unsubscribe = options.subscribe((status, prevStatus) => {
		if (status === 'online' && prevStatus !== 'online') {
			tryFire();
		}
	});

	return {
		stop() {
			unsubscribe();
		},
	};
}

import type { NetworkStatus } from '../../stores/useNetworkStatusStore';

export interface HeartbeatRunnerOptions {
	ping: () => Promise<void>;
	setStatus: (next: NetworkStatus) => void;
	isVisible: () => boolean;
	onVisibilityChange: (cb: () => void) => () => void;
	minIntervalMs?: number;
	maxIntervalMs?: number;
	backoffFactor?: number;
	failureThreshold?: number;
}

export interface HeartbeatRunner {
	stop(): void;
}

const DEFAULTS = {
	minIntervalMs: 30_000,
	maxIntervalMs: 5 * 60_000,
	backoffFactor: 2,
	failureThreshold: 2,
} as const;

export function startHeartbeatRunner(options: HeartbeatRunnerOptions): HeartbeatRunner {
	const minIntervalMs = options.minIntervalMs ?? DEFAULTS.minIntervalMs;
	const maxIntervalMs = options.maxIntervalMs ?? DEFAULTS.maxIntervalMs;
	const backoffFactor = options.backoffFactor ?? DEFAULTS.backoffFactor;
	const failureThreshold = options.failureThreshold ?? DEFAULTS.failureThreshold;

	let timer: ReturnType<typeof setTimeout> | null = null;
	let failures = 0;
	let stopped = false;
	let inFlight = false;

	const clear = () => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};

	const schedule = (delayMs: number) => {
		clear();
		if (stopped || !options.isVisible()) return;
		timer = setTimeout(() => {
			void tick();
		}, delayMs);
	};

	const computeBackoffDelay = () => {
		const exponent = Math.max(0, failures - 1);
		const raw = minIntervalMs * Math.pow(backoffFactor, exponent);
		return Math.min(raw, maxIntervalMs);
	};

	const tick = async () => {
		if (stopped || !options.isVisible() || inFlight) return;
		inFlight = true;
		try {
			await options.ping();
			failures = 0;
			options.setStatus('online');
			schedule(minIntervalMs);
		} catch {
			failures += 1;
			options.setStatus(failures >= failureThreshold ? 'offline' : 'unstable');
			schedule(computeBackoffDelay());
		} finally {
			inFlight = false;
		}
	};

	const handleVisibilityChange = () => {
		if (stopped) return;
		if (options.isVisible()) {
			schedule(0);
		} else {
			clear();
		}
	};

	const unsubscribeVisibility = options.onVisibilityChange(handleVisibilityChange);

	if (options.isVisible()) {
		schedule(0);
	}

	return {
		stop() {
			stopped = true;
			clear();
			unsubscribeVisibility();
		},
	};
}

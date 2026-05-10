import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startHeartbeatRunner, type HeartbeatRunnerOptions } from './heartbeat';
import type { NetworkStatus } from '../../stores/useNetworkStatusStore';

interface Harness {
	visible: boolean;
	statuses: NetworkStatus[];
	pingResults: Array<'ok' | 'fail'>;
	pingCalls: number;
	visibilityListener: (() => void) | null;
}

function createHarness(): Harness {
	return {
		visible: true,
		statuses: [],
		pingResults: [],
		pingCalls: 0,
		visibilityListener: null,
	};
}

function createOptions(harness: Harness, overrides: Partial<HeartbeatRunnerOptions> = {}) {
	const options: HeartbeatRunnerOptions = {
		ping: async () => {
			harness.pingCalls += 1;
			const result = harness.pingResults.shift() ?? 'ok';
			if (result === 'fail') {
				throw new Error('ping failed');
			}
		},
		setStatus: (next) => {
			harness.statuses.push(next);
		},
		isVisible: () => harness.visible,
		onVisibilityChange: (cb) => {
			harness.visibilityListener = cb;
			return () => {
				harness.visibilityListener = null;
			};
		},
		minIntervalMs: 1000,
		maxIntervalMs: 8000,
		backoffFactor: 2,
		failureThreshold: 2,
		...overrides,
	};
	return options;
}

describe('startHeartbeatRunner', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('start() 直後に初回 ping が走り成功すれば status=online になる', async () => {
		const h = createHarness();
		h.pingResults = ['ok'];
		const runner = startHeartbeatRunner(createOptions(h));
		await vi.advanceTimersByTimeAsync(0);

		expect(h.pingCalls).toBe(1);
		expect(h.statuses).toEqual(['online']);
		runner.stop();
	});

	it('1 回目の失敗では unstable、2 回連続失敗で offline になる', async () => {
		const h = createHarness();
		h.pingResults = ['fail', 'fail', 'fail'];
		const runner = startHeartbeatRunner(createOptions(h));

		await vi.advanceTimersByTimeAsync(0);
		expect(h.statuses).toEqual(['unstable']);

		await vi.advanceTimersByTimeAsync(1000); // backoff: min × 2^0
		expect(h.statuses[h.statuses.length - 1]).toBe('offline');

		runner.stop();
	});

	it('成功すると failures がリセットされ、次の単発失敗が再び unstable から始まる', async () => {
		const h = createHarness();
		h.pingResults = ['ok', 'fail'];
		const runner = startHeartbeatRunner(createOptions(h));

		await vi.advanceTimersByTimeAsync(0); // 初回: ok → online
		await vi.advanceTimersByTimeAsync(1000); // 次回: fail → unstable
		expect(h.statuses).toEqual(['online', 'unstable']);

		runner.stop();
	});

	it('連続失敗時のバックオフは min × factor^(attempt-1) で増え、max でクランプされる', async () => {
		const h = createHarness();
		h.pingResults = ['fail', 'fail', 'fail', 'fail', 'fail'];
		const runner = startHeartbeatRunner(
			createOptions(h, { minIntervalMs: 1000, maxIntervalMs: 4000, backoffFactor: 2 }),
		);

		await vi.advanceTimersByTimeAsync(0); // 初回 fail
		expect(h.pingCalls).toBe(1);

		await vi.advanceTimersByTimeAsync(999);
		expect(h.pingCalls).toBe(1); // まだ来ない
		await vi.advanceTimersByTimeAsync(1);
		expect(h.pingCalls).toBe(2); // 1000ms 経過

		await vi.advanceTimersByTimeAsync(2000);
		expect(h.pingCalls).toBe(3); // 2000ms 経過

		await vi.advanceTimersByTimeAsync(4000);
		expect(h.pingCalls).toBe(4); // クランプ後 4000ms

		await vi.advanceTimersByTimeAsync(4000);
		expect(h.pingCalls).toBe(5); // さらにクランプで 4000ms

		runner.stop();
	});

	it('visibilityState=hidden の間は ping が走らず、visible 復帰で再開する', async () => {
		const h = createHarness();
		h.pingResults = ['ok', 'ok'];
		const runner = startHeartbeatRunner(createOptions(h));

		await vi.advanceTimersByTimeAsync(0); // 初回 ping
		expect(h.pingCalls).toBe(1);

		h.visible = false;
		h.visibilityListener?.();

		await vi.advanceTimersByTimeAsync(10_000); // hidden 中はタイマー進めても ping されない
		expect(h.pingCalls).toBe(1);

		h.visible = true;
		h.visibilityListener?.();
		await vi.advanceTimersByTimeAsync(0); // visible 復帰で即 ping
		expect(h.pingCalls).toBe(2);

		runner.stop();
	});

	it('stop() するとそれ以降タイマーは発火しない', async () => {
		const h = createHarness();
		h.pingResults = ['ok', 'ok', 'ok'];
		const runner = startHeartbeatRunner(createOptions(h));
		await vi.advanceTimersByTimeAsync(0);
		expect(h.pingCalls).toBe(1);

		runner.stop();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(h.pingCalls).toBe(1);
		expect(h.visibilityListener).toBeNull();
	});

	it('failureThreshold をオーバーライドできる', async () => {
		const h = createHarness();
		h.pingResults = ['fail', 'fail', 'fail'];
		const runner = startHeartbeatRunner(createOptions(h, { failureThreshold: 3 }));

		await vi.advanceTimersByTimeAsync(0);
		expect(h.statuses).toEqual(['unstable']);

		await vi.advanceTimersByTimeAsync(1000);
		expect(h.statuses[h.statuses.length - 1]).toBe('unstable');

		await vi.advanceTimersByTimeAsync(2000);
		expect(h.statuses[h.statuses.length - 1]).toBe('offline');

		runner.stop();
	});
});

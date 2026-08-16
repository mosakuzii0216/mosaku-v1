import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startReconnectRefetch } from './reconnect-refetch';
import type { NetworkStatus } from '../../stores/useNetworkStatusStore';

type StatusListener = (status: NetworkStatus, prevStatus: NetworkStatus) => void;

function makeSubscribe() {
	let listener: StatusListener | null = null;
	const subscribe = (cb: StatusListener) => {
		listener = cb;
		return () => {
			listener = null;
		};
	};
	const emit = (status: NetworkStatus, prev: NetworkStatus) => listener?.(status, prev);
	return { subscribe, emit };
}

describe('startReconnectRefetch', () => {
	let invalidate: ReturnType<typeof vi.fn>;
	let now: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		invalidate = vi.fn();
		now = vi.fn(() => 0);
	});

	it('unstable → online エッジで invalidate が 1 回呼ばれる', () => {
		const { subscribe, emit } = makeSubscribe();
		startReconnectRefetch({
			subscribe,
			getStatus: () => 'unstable',
			invalidate,
			now,
		});

		emit('online', 'unstable');
		expect(invalidate).toHaveBeenCalledTimes(1);
	});

	it('offline → online エッジで invalidate が 1 回呼ばれる', () => {
		const { subscribe, emit } = makeSubscribe();
		startReconnectRefetch({
			subscribe,
			getStatus: () => 'offline',
			invalidate,
			now,
		});

		emit('online', 'offline');
		expect(invalidate).toHaveBeenCalledTimes(1);
	});

	it('劣化方向（online → unstable）では invalidate しない', () => {
		const { subscribe, emit } = makeSubscribe();
		// getStatus は unstable でスタート（reconcile を起動しない）し、online 経由後に劣化をテスト
		startReconnectRefetch({
			subscribe,
			getStatus: () => 'unstable',
			invalidate,
			now,
		});

		// online になって invalidate が 1 回発火
		emit('online', 'unstable');
		expect(invalidate).toHaveBeenCalledTimes(1);

		// 劣化方向では追加発火しない
		emit('unstable', 'online');
		expect(invalidate).toHaveBeenCalledTimes(1);
	});

	it('online → offline の劣化方向でも invalidate の追加発火がない', () => {
		const { subscribe, emit } = makeSubscribe();
		startReconnectRefetch({
			subscribe,
			getStatus: () => 'unstable',
			invalidate,
			now,
		});

		// online になって 1 回発火
		emit('online', 'unstable');
		expect(invalidate).toHaveBeenCalledTimes(1);

		// offline への劣化では追加発火しない
		emit('offline', 'online');
		expect(invalidate).toHaveBeenCalledTimes(1);
	});

	it('cooldown 内の online → unstable → online フラップで invalidate が 1 回に抑制される', () => {
		let currentTime = 0;
		now = vi.fn(() => currentTime);
		const { subscribe, emit } = makeSubscribe();
		startReconnectRefetch({
			subscribe,
			getStatus: () => 'unstable',
			invalidate,
			cooldownMs: 2000,
			now,
		});

		// 1回目の online エッジ
		emit('online', 'unstable');
		expect(invalidate).toHaveBeenCalledTimes(1);

		// cooldown 内（500ms後）に再び unstable → online
		currentTime = 500;
		emit('unstable', 'online');
		emit('online', 'unstable');

		// cooldown 内なので 2 回目は抑制される
		expect(invalidate).toHaveBeenCalledTimes(1);
	});

	it('cooldown 後の再接続は invalidate が発火する', () => {
		let currentTime = 0;
		now = vi.fn(() => currentTime);
		const { subscribe, emit } = makeSubscribe();
		startReconnectRefetch({
			subscribe,
			getStatus: () => 'unstable',
			invalidate,
			cooldownMs: 2000,
			now,
		});

		emit('online', 'unstable');
		expect(invalidate).toHaveBeenCalledTimes(1);

		// cooldown 後（3000ms後）に再接続
		currentTime = 3000;
		emit('unstable', 'online');
		emit('online', 'unstable');

		expect(invalidate).toHaveBeenCalledTimes(2);
	});

	it('start() 時に status が online なら初回 reconcile が 1 回発火する（マウント遅延レース救済）', () => {
		const { subscribe } = makeSubscribe();
		startReconnectRefetch({
			subscribe,
			getStatus: () => 'online',
			invalidate,
			now,
		});

		expect(invalidate).toHaveBeenCalledTimes(1);
	});

	it('start() 時に status が unstable なら reconcile しない', () => {
		const { subscribe } = makeSubscribe();
		startReconnectRefetch({
			subscribe,
			getStatus: () => 'unstable',
			invalidate,
			now,
		});

		expect(invalidate).not.toHaveBeenCalled();
	});

	it('start() の reconcile と直後の online エッジが cooldown を共有し二重発火しない', () => {
		let currentTime = 0;
		now = vi.fn(() => currentTime);
		const { subscribe, emit } = makeSubscribe();
		startReconnectRefetch({
			subscribe,
			getStatus: () => 'online',
			invalidate,
			cooldownMs: 2000,
			now,
		});

		// reconcile が発火済み
		expect(invalidate).toHaveBeenCalledTimes(1);

		// cooldown 内（500ms後）に online エッジが来ても抑制される
		currentTime = 500;
		emit('online', 'unstable');
		expect(invalidate).toHaveBeenCalledTimes(1);
	});

	it('stop() 後は購読が解除され発火しない', () => {
		const { subscribe, emit } = makeSubscribe();
		const runner = startReconnectRefetch({
			subscribe,
			getStatus: () => 'unstable',
			invalidate,
			now,
		});

		runner.stop();
		emit('online', 'unstable');
		expect(invalidate).not.toHaveBeenCalled();
	});

	it('invalidate が targetKeys を受け取って呼ばれる', () => {
		const { subscribe, emit } = makeSubscribe();
		const targetKeys = [['memos'], ['notebooks']] as const;
		startReconnectRefetch({
			subscribe,
			getStatus: () => 'unstable',
			invalidate,
			targetKeys,
			now,
		});

		emit('online', 'unstable');
		expect(invalidate).toHaveBeenCalledWith(targetKeys);
	});
});

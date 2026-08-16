import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLeaderElection, type BroadcastChannelLike } from './leader-election';

interface FakeChannel extends BroadcastChannelLike {
	posted: unknown[];
	closed: boolean;
	dispatch(data: unknown): void;
}

function createFakeChannel(): FakeChannel {
	const channel: FakeChannel = {
		posted: [],
		closed: false,
		onmessage: null,
		postMessage(data: unknown) {
			channel.posted.push(data);
		},
		close() {
			channel.closed = true;
		},
		dispatch(data: unknown) {
			if (channel.onmessage) channel.onmessage({ data });
		},
	};
	return channel;
}

describe('createLeaderElection', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('claim タイムアウト経過後に leader として確定する', async () => {
		const channel = createFakeChannel();
		const election = createLeaderElection({
			channelFactory: () => channel,
			tabId: 'tab-A',
			claimTimeoutMs: 100,
		});

		const startPromise = election.start();
		expect(election.isLeader()).toBe(false);
		expect(channel.posted[0]).toEqual({ type: 'claim', tabId: 'tab-A' });

		await vi.advanceTimersByTimeAsync(100);
		await startPromise;

		expect(election.isLeader()).toBe(true);
		expect(channel.posted).toContainEqual({ type: 'leader-announce', tabId: 'tab-A' });
		election.stop();
	});

	it('別タブから leader-announce が来たら follower のままになる', async () => {
		const channel = createFakeChannel();
		const election = createLeaderElection({
			channelFactory: () => channel,
			tabId: 'tab-A',
			claimTimeoutMs: 100,
		});

		const startPromise = election.start();
		channel.dispatch({ type: 'leader-announce', tabId: 'tab-B' });

		await vi.advanceTimersByTimeAsync(200);
		await startPromise;

		expect(election.isLeader()).toBe(false);
		election.stop();
	});

	it('自分の tabId を含む leader-announce は自己受信なので follower にならない', async () => {
		const channel = createFakeChannel();
		const election = createLeaderElection({
			channelFactory: () => channel,
			tabId: 'tab-A',
			claimTimeoutMs: 50,
		});

		const startPromise = election.start();
		channel.dispatch({ type: 'leader-announce', tabId: 'tab-A' });

		await vi.advanceTimersByTimeAsync(50);
		await startPromise;

		expect(election.isLeader()).toBe(true);
		election.stop();
	});

	it('リーダー時に他タブから claim を受信したら leader-announce を返信する', async () => {
		const channel = createFakeChannel();
		const election = createLeaderElection({
			channelFactory: () => channel,
			tabId: 'tab-A',
			claimTimeoutMs: 50,
		});

		const startPromise = election.start();
		await vi.advanceTimersByTimeAsync(50);
		await startPromise;

		channel.posted.length = 0;
		channel.dispatch({ type: 'claim', tabId: 'tab-B' });

		expect(channel.posted).toContainEqual({ type: 'leader-announce', tabId: 'tab-A' });
		election.stop();
	});

	it('stop でチャネルを閉じ、leader フラグも解除する', async () => {
		const channel = createFakeChannel();
		const election = createLeaderElection({
			channelFactory: () => channel,
			tabId: 'tab-A',
			claimTimeoutMs: 10,
		});
		const startPromise = election.start();
		await vi.advanceTimersByTimeAsync(10);
		await startPromise;

		expect(election.isLeader()).toBe(true);
		election.stop();
		expect(election.isLeader()).toBe(false);
		expect(channel.closed).toBe(true);
	});

	it('start を 2 回呼んでも 2 回目はノーオペ', async () => {
		const channel = createFakeChannel();
		const election = createLeaderElection({
			channelFactory: () => channel,
			tabId: 'tab-A',
			claimTimeoutMs: 10,
		});
		const firstStart = election.start();
		await vi.advanceTimersByTimeAsync(10);
		await firstStart;
		const postedAfterFirst = channel.posted.length;

		await election.start();
		expect(channel.posted.length).toBe(postedAfterFirst);
		election.stop();
	});
});

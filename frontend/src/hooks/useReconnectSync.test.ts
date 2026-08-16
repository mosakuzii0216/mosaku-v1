import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => {
	const stopMock = vi.fn();
	const startReconnectRefetchMock = vi.fn(() => ({ stop: stopMock }));
	const queryClientMock = {
		invalidateQueries: vi.fn(),
	};
	const triggerDrainNowMock = vi.fn(() =>
		Promise.resolve({
			kind: 'completed' as const,
			succeeded: 0,
			skippedByLww: [],
			removedOnServer: [],
			failed: [],
		}),
	);
	const getSyncEngineMock = vi.fn(() => ({ triggerDrainNow: triggerDrainNowMock }));
	return {
		stopMock,
		startReconnectRefetchMock,
		queryClientMock,
		triggerDrainNowMock,
		getSyncEngineMock,
	};
});

vi.mock('../utils/sync/reconnect-refetch', () => ({
	startReconnectRefetch: (...args: unknown[]) => mocks.startReconnectRefetchMock(...args),
}));

vi.mock('../utils/sync/instance', () => ({
	getSyncEngine: () => mocks.getSyncEngineMock(),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => mocks.queryClientMock,
}));

vi.mock('../stores/useNetworkStatusStore', () => ({
	useNetworkStatusStore: {
		getState: () => ({ status: 'unstable' }),
		subscribe: vi.fn(() => () => undefined),
	},
}));

import { useReconnectSync } from './useReconnectSync';

describe('useReconnectSync', () => {
	beforeEach(() => {
		mocks.stopMock.mockClear();
		mocks.startReconnectRefetchMock.mockClear();
		mocks.startReconnectRefetchMock.mockReturnValue({ stop: mocks.stopMock });
		mocks.queryClientMock.invalidateQueries.mockClear();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('マウント時に startReconnectRefetch が 1 回呼ばれる', () => {
		renderHook(() => useReconnectSync());
		expect(mocks.startReconnectRefetchMock).toHaveBeenCalledTimes(1);
	});

	it('アンマウント時に runner.stop() が呼ばれる', async () => {
		const { unmount } = renderHook(() => useReconnectSync());

		await act(async () => {
			unmount();
		});

		expect(mocks.stopMock).toHaveBeenCalledTimes(1);
	});

	it('二重マウントガード: 同一レンダリングで startReconnectRefetch は 1 回だけ呼ばれる', () => {
		const { rerender } = renderHook(() => useReconnectSync());
		rerender();
		rerender();

		expect(mocks.startReconnectRefetchMock).toHaveBeenCalledTimes(1);
	});

	it('startReconnectRefetch に invalidate 関数が渡される', () => {
		renderHook(() => useReconnectSync());

		const callArgs = mocks.startReconnectRefetchMock.mock.calls[0]?.[0];
		expect(callArgs).toHaveProperty('invalidate');
		expect(typeof callArgs.invalidate).toBe('function');
	});

	it('startReconnectRefetch に subscribe 関数が渡される', () => {
		renderHook(() => useReconnectSync());

		const callArgs = mocks.startReconnectRefetchMock.mock.calls[0]?.[0];
		expect(callArgs).toHaveProperty('subscribe');
		expect(typeof callArgs.subscribe).toBe('function');
	});

	it('startReconnectRefetch に getStatus 関数が渡される', () => {
		renderHook(() => useReconnectSync());

		const callArgs = mocks.startReconnectRefetchMock.mock.calls[0]?.[0];
		expect(callArgs).toHaveProperty('getStatus');
		expect(typeof callArgs.getStatus).toBe('function');
	});
});

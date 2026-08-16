import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const mocks = vi.hoisted(() => {
	const repositoryMock = {
		verifyOwnerOrPurge: vi.fn(async () => undefined),
		listPending: vi.fn(async () => [] as unknown[]),
	};
	const engineMock = {
		start: vi.fn(async () => undefined),
		stop: vi.fn(),
	};
	const heartbeatStop = vi.fn();
	const startHeartbeatRunnerMock = vi.fn(() => ({ stop: heartbeatStop }));
	const subscribeWindowNetworkEventsMock = vi.fn(() => () => undefined);
	const getCurrentUserIdMock = vi.fn<() => string | null>(() => 'user-1');
	return {
		repositoryMock,
		engineMock,
		heartbeatStop,
		startHeartbeatRunnerMock,
		subscribeWindowNetworkEventsMock,
		getCurrentUserIdMock,
	};
});

vi.mock('../utils/offline/instance', () => ({
	getOfflineRepository: () => ({
		repository: mocks.repositoryMock,
		db: {},
		quotaManager: {},
		ready: Promise.resolve({ db: {}, recovered: false }),
	}),
	resetOfflineRepositoryForTest: () => undefined,
}));

vi.mock('../utils/sync/instance', () => ({
	getSyncEngine: () => mocks.engineMock,
	resetSyncEngineForTest: () => undefined,
}));

vi.mock('../utils/offline/heartbeat', () => ({
	startHeartbeatRunner: (...args: unknown[]) => mocks.startHeartbeatRunnerMock(...args),
}));

vi.mock('../stores/useNetworkStatusStore', async () => {
	const actual = await vi.importActual<typeof import('../stores/useNetworkStatusStore')>(
		'../stores/useNetworkStatusStore',
	);
	return {
		...actual,
		subscribeWindowNetworkEvents: mocks.subscribeWindowNetworkEventsMock,
	};
});

vi.mock('../utils/auth', () => ({
	AuthTokenManager: {
		getAccessToken: () => 'fake-token',
		isTokenExpired: () => false,
		getTokenPayload: () => {
			const sub = mocks.getCurrentUserIdMock();
			return sub ? { sub } : null;
		},
	},
}));

vi.mock('./useTagQueries', () => ({
	useTagQueries: () => ({ tagsQuery: { refetch: vi.fn(), isLoading: false, error: null } }),
}));

vi.mock('../utils/api', () => ({
	apiClient: { health: vi.fn(async () => ({ status: 'ok' })) },
}));

import { useAppInit } from './useAppInit';
import { useAppReadyStore } from '../stores/useAppReadyStore';

describe('useAppInit', () => {
	beforeEach(() => {
		useAppReadyStore.getState().resetForTest();
		mocks.repositoryMock.verifyOwnerOrPurge.mockClear();
		mocks.repositoryMock.listPending.mockReset();
		mocks.repositoryMock.listPending.mockResolvedValue([]);
		mocks.engineMock.start.mockClear();
		mocks.engineMock.start.mockResolvedValue(undefined);
		mocks.engineMock.stop.mockClear();
		mocks.heartbeatStop.mockClear();
		mocks.startHeartbeatRunnerMock.mockClear();
		mocks.startHeartbeatRunnerMock.mockReturnValue({ stop: mocks.heartbeatStop });
		mocks.subscribeWindowNetworkEventsMock.mockClear();
		mocks.subscribeWindowNetworkEventsMock.mockReturnValue(() => undefined);
		mocks.getCurrentUserIdMock.mockReturnValue('user-1');
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("starts in 'booting' status and transitions to 'ready' once initialization completes", async () => {
		const { result } = renderHook(() => useAppInit());

		await waitFor(() => {
			expect(useAppReadyStore.getState().status).toBe('ready');
		});

		expect(result.current.isReady).toBe(true);
		expect(result.current.pendingCountOnBoot).toBe(0);
	});

	it('executes the init steps in the prescribed order', async () => {
		const order: string[] = [];
		mocks.repositoryMock.verifyOwnerOrPurge.mockImplementation(async () => {
			order.push('verify');
		});
		mocks.engineMock.start.mockImplementation(async () => {
			order.push('engine');
		});
		mocks.subscribeWindowNetworkEventsMock.mockImplementation(() => {
			order.push('network');
			return () => undefined;
		});
		mocks.startHeartbeatRunnerMock.mockImplementation(() => {
			order.push('heartbeat');
			return { stop: mocks.heartbeatStop };
		});

		renderHook(() => useAppInit());

		await waitFor(() => {
			expect(useAppReadyStore.getState().status).toBe('ready');
		});

		expect(order).toEqual(['verify', 'network', 'heartbeat', 'engine']);
	});

	it("derives pendingCountOnBoot from repository.listPending() so 'offline-saved' can be re-shown", async () => {
		mocks.repositoryMock.listPending.mockResolvedValue([{ memoId: 'a' }, { memoId: 'b' }]);

		renderHook(() => useAppInit());

		await waitFor(() => {
			expect(useAppReadyStore.getState().pendingCountOnBoot).toBe(2);
		});
	});

	it("transitions to 'error' status when an init step rejects", async () => {
		mocks.engineMock.start.mockRejectedValueOnce(new Error('boom'));

		renderHook(() => useAppInit());

		await waitFor(() => {
			expect(useAppReadyStore.getState().status).toBe('error');
		});
		expect(useAppReadyStore.getState().error?.message).toBe('boom');
	});

	it('cleans up heartbeat / network subscriptions and stops the engine on unmount', async () => {
		const unsubscribeNetwork = vi.fn();
		mocks.subscribeWindowNetworkEventsMock.mockReturnValue(unsubscribeNetwork);

		const { unmount } = renderHook(() => useAppInit());

		await waitFor(() => {
			expect(useAppReadyStore.getState().status).toBe('ready');
		});

		await act(async () => {
			unmount();
		});

		expect(mocks.heartbeatStop).toHaveBeenCalled();
		expect(unsubscribeNetwork).toHaveBeenCalled();
		expect(mocks.engineMock.stop).toHaveBeenCalled();
	});

	it('skips owner verification when no user is logged in (booting still completes)', async () => {
		mocks.getCurrentUserIdMock.mockReturnValue(null);

		renderHook(() => useAppInit());

		await waitFor(() => {
			expect(useAppReadyStore.getState().status).toBe('ready');
		});
		expect(mocks.repositoryMock.verifyOwnerOrPurge).not.toHaveBeenCalled();
	});
});

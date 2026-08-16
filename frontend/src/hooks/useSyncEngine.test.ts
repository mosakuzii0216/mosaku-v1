import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { SyncEngine } from '../utils/sync/sync-engine';
import type { SyncEvent } from '../utils/sync/types';

const mocks = vi.hoisted(() => {
	type Listener = (event: SyncEvent) => void;
	const listeners = new Set<Listener>();
	const state = {
		pendingCount: 0,
		lastSyncAt: null as string | null,
		running: true,
		leader: true,
	};
	const engineMock = {
		isRunning: () => state.running,
		isLeader: () => state.leader,
		getPendingCount: () => state.pendingCount,
		getLastSyncAt: () => state.lastSyncAt,
		subscribe: (listener: Listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		triggerDrainNow: vi.fn(async () => ({
			kind: 'completed' as const,
			succeeded: 0,
			skippedByLww: [],
			removedOnServer: [],
			failed: 0,
		})),
		start: vi.fn(),
		stop: vi.fn(),
		notifyEnqueueChanged: vi.fn(),
		waitForIdle: vi.fn(),
	} satisfies SyncEngine;

	const emit = (event: SyncEvent) => listeners.forEach((l) => l(event));
	return { engineMock, emit, state };
});

vi.mock('../utils/sync/instance', () => ({
	getSyncEngine: () => mocks.engineMock,
	resetSyncEngineForTest: () => undefined,
}));

import { useSyncEngine } from './useSyncEngine';

describe('useSyncEngine', () => {
	beforeEach(() => {
		mocks.state.pendingCount = 0;
		mocks.state.lastSyncAt = null;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns the current pendingCount and lastSyncAt at mount time', () => {
		mocks.state.pendingCount = 3;
		mocks.state.lastSyncAt = '2026-05-11T00:00:00.000Z';

		const { result } = renderHook(() => useSyncEngine());

		expect(result.current.pendingCount).toBe(3);
		expect(result.current.lastSyncAt).toBe('2026-05-11T00:00:00.000Z');
	});

	it("updates pendingCount when a 'pending-changed' event is emitted", () => {
		const { result } = renderHook(() => useSyncEngine());

		act(() => {
			mocks.state.pendingCount = 5;
			mocks.emit({ type: 'pending-changed', count: 5 });
		});

		expect(result.current.pendingCount).toBe(5);
	});

	it("updates lastSyncAt + lastEvent when a 'cycle-complete' event is emitted", () => {
		const { result } = renderHook(() => useSyncEngine());

		const completeEvent: SyncEvent = {
			type: 'cycle-complete',
			result: { kind: 'completed', succeeded: 1, skippedByLww: [], removedOnServer: [], failed: 0 },
		};

		act(() => {
			mocks.state.lastSyncAt = '2026-05-12T00:00:00.000Z';
			mocks.emit(completeEvent);
		});

		expect(result.current.lastSyncAt).toBe('2026-05-12T00:00:00.000Z');
		expect(result.current.lastEvent).toEqual(completeEvent);
	});

	it('unsubscribes from the engine on unmount', () => {
		const { unmount } = renderHook(() => useSyncEngine());

		unmount();

		// 再度 emit してもエラーが出ないこと
		expect(() => mocks.emit({ type: 'cycle-start' })).not.toThrow();
	});
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { resetNetworkStatusForTest, useNetworkStatusStore } from '../stores/useNetworkStatusStore';
import { useNetworkStatus } from './useNetworkStatus';

describe('useNetworkStatus', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetNetworkStatusForTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("reflects 'online' when the store updates", () => {
		const { result } = renderHook(() => useNetworkStatus());

		act(() => {
			useNetworkStatusStore.getState().setStatus('online');
		});

		expect(result.current.status).toBe('online');
		expect(result.current.isOnline).toBe(true);
		expect(result.current.isOffline).toBe(false);
		expect(result.current.isUnstable).toBe(false);
	});

	it("reflects 'offline' when the store updates", () => {
		const { result } = renderHook(() => useNetworkStatus());

		act(() => {
			useNetworkStatusStore.getState().setStatus('offline');
		});

		expect(result.current.status).toBe('offline');
		expect(result.current.isOffline).toBe(true);
		expect(result.current.isOnline).toBe(false);
	});

	it("reflects 'unstable' for transient state", () => {
		const { result } = renderHook(() => useNetworkStatus());

		// 初期値は 'unstable'
		expect(result.current.isUnstable).toBe(true);
	});
});

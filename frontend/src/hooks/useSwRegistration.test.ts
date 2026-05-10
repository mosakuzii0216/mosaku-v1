import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register/react', () => ({
	useRegisterSW: vi.fn(),
}));

vi.mock('../utils/pwa/cache-cleanup', () => ({
	purgeLegacyApiCache: vi.fn().mockResolvedValue({ deleted: false }),
}));

import { useRegisterSW } from 'virtual:pwa-register/react';
import { purgeLegacyApiCache } from '../utils/pwa/cache-cleanup';
import { useSwRegistration } from './useSwRegistration';

const useRegisterSWMock = vi.mocked(useRegisterSW);
const purgeLegacyApiCacheMock = vi.mocked(purgeLegacyApiCache);

interface MockState {
	needRefresh?: [boolean, ReturnType<typeof vi.fn>];
	offlineReady?: [boolean, ReturnType<typeof vi.fn>];
	updateServiceWorker?: ReturnType<typeof vi.fn>;
	captureOptions?: (options: Parameters<typeof useRegisterSW>[0]) => void;
}

function setupUseRegisterSW(state: MockState = {}) {
	const setNeedRefresh = vi.fn();
	const setOfflineReady = vi.fn();
	const updateServiceWorker = state.updateServiceWorker ?? vi.fn(async () => {});
	const needRefresh = state.needRefresh ?? [false, setNeedRefresh];
	const offlineReady = state.offlineReady ?? [false, setOfflineReady];

	useRegisterSWMock.mockImplementation((options) => {
		state.captureOptions?.(options);
		return { needRefresh, offlineReady, updateServiceWorker };
	});

	return { setNeedRefresh, setOfflineReady, updateServiceWorker };
}

describe('useSwRegistration', () => {
	beforeEach(() => {
		useRegisterSWMock.mockReset();
		purgeLegacyApiCacheMock.mockReset();
		purgeLegacyApiCacheMock.mockResolvedValue({ deleted: false });
	});

	it('exposes needRefresh / offlineReady from useRegisterSW', () => {
		setupUseRegisterSW({
			needRefresh: [true, vi.fn()],
			offlineReady: [true, vi.fn()],
		});

		const { result } = renderHook(() => useSwRegistration());

		expect(result.current.needRefresh).toBe(true);
		expect(result.current.offlineReady).toBe(true);
	});

	it('calls purgeLegacyApiCache when SW is registered (initial cleanup of legacy api-cache)', async () => {
		let captured: Parameters<typeof useRegisterSW>[0] | undefined;
		setupUseRegisterSW({
			captureOptions: (options) => {
				captured = options;
			},
		});

		renderHook(() => useSwRegistration());

		expect(captured?.onRegisteredSW).toBeTypeOf('function');
		await act(async () => {
			captured?.onRegisteredSW?.('/sw.js', undefined);
			await Promise.resolve();
		});
		expect(purgeLegacyApiCacheMock).toHaveBeenCalledTimes(1);
	});

	it('update() invokes updateServiceWorker(true) for forced reload', async () => {
		const updateServiceWorker = vi.fn(async () => {});
		setupUseRegisterSW({ updateServiceWorker });

		const { result } = renderHook(() => useSwRegistration());

		await act(async () => {
			await result.current.update();
		});
		expect(updateServiceWorker).toHaveBeenCalledWith(true);
	});

	it('dismiss() resets both needRefresh and offlineReady to false', () => {
		const setNeedRefresh = vi.fn();
		const setOfflineReady = vi.fn();
		setupUseRegisterSW({
			needRefresh: [true, setNeedRefresh],
			offlineReady: [true, setOfflineReady],
		});

		const { result } = renderHook(() => useSwRegistration());

		act(() => {
			result.current.dismiss();
		});
		expect(setNeedRefresh).toHaveBeenCalledWith(false);
		expect(setOfflineReady).toHaveBeenCalledWith(false);
	});

	it('does not throw when SW registration errors (graceful degradation)', () => {
		let captured: Parameters<typeof useRegisterSW>[0] | undefined;
		setupUseRegisterSW({
			captureOptions: (options) => {
				captured = options;
			},
		});

		renderHook(() => useSwRegistration());

		expect(() => captured?.onRegisterError?.(new Error('boom'))).not.toThrow();
	});
});

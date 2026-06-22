import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register/react', () => ({
	useRegisterSW: vi.fn(),
}));

vi.mock('../utils/pwa/cache-cleanup', () => ({
	purgeLegacyApiCache: vi.fn().mockResolvedValue({ deleted: false }),
}));

import { useRegisterSW } from 'virtual:pwa-register/react';
import { purgeLegacyApiCache } from '../utils/pwa/cache-cleanup';
import { SW_UPDATE_PROBE_INTERVAL_MS, useSwRegistration } from './useSwRegistration';

const useRegisterSWMock = vi.mocked(useRegisterSW);
const purgeLegacyApiCacheMock = vi.mocked(purgeLegacyApiCache);

function makeFakeRegistration(opts: { installing?: ServiceWorker | null } = {}) {
	const update = vi.fn().mockResolvedValue(undefined);
	return {
		registration: {
			get installing() {
				return opts.installing ?? null;
			},
			update,
		} as unknown as ServiceWorkerRegistration,
		update,
	};
}

interface MockSetupOptions {
	needRefresh?: [boolean, ReturnType<typeof vi.fn>];
	offlineReady?: [boolean, ReturnType<typeof vi.fn>];
	updateServiceWorker?: ReturnType<typeof vi.fn>;
	captureOptions?: (options: Parameters<typeof useRegisterSW>[0]) => void;
}

function setupUseRegisterSW(options: MockSetupOptions = {}) {
	const setNeedRefresh = vi.fn();
	const setOfflineReady = vi.fn();
	const updateServiceWorker = options.updateServiceWorker ?? vi.fn().mockResolvedValue(undefined);
	const needRefresh = options.needRefresh ?? [false, setNeedRefresh];
	const offlineReady = options.offlineReady ?? [false, setOfflineReady];

	useRegisterSWMock.mockImplementation((opts) => {
		options.captureOptions?.(opts);
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

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	// ─── Task 2.1: 新公開面 ────────────────────────────────────────────────────

	describe('updateAvailable（ガード付き自動駆動の更新シグナル）', () => {
		it('新 SW が waiting にあるとき updateAvailable は true', () => {
			setupUseRegisterSW({ needRefresh: [true, vi.fn()] });
			const { result } = renderHook(() => useSwRegistration());
			expect(result.current.updateAvailable).toBe(true);
		});

		it('新 SW が waiting にないとき updateAvailable は false', () => {
			setupUseRegisterSW({ needRefresh: [false, vi.fn()] });
			const { result } = renderHook(() => useSwRegistration());
			expect(result.current.updateAvailable).toBe(false);
		});
	});

	describe('applyUpdate()（skipWaiting + リロード起動）', () => {
		it('applyUpdate() は updateServiceWorker(true) を呼び出す', async () => {
			const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
			setupUseRegisterSW({ updateServiceWorker });
			const { result } = renderHook(() => useSwRegistration());

			await act(async () => {
				await result.current.applyUpdate();
			});

			expect(updateServiceWorker).toHaveBeenCalledWith(true);
		});
	});

	// ─── 不変則: purgeLegacyApiCache ──────────────────────────────────────────

	describe('purgeLegacyApiCache（Req 4.3）', () => {
		it('onRegisteredSW で purgeLegacyApiCache を実行する（legacy api-cache の初期クリーンアップ）', async () => {
			let capturedOptions: Parameters<typeof useRegisterSW>[0] | undefined;
			setupUseRegisterSW({
				captureOptions: (opts) => {
					capturedOptions = opts;
				},
			});
			renderHook(() => useSwRegistration());

			const { registration } = makeFakeRegistration();
			await act(async () => {
				capturedOptions?.onRegisteredSW?.('/sw.js', registration);
				await Promise.resolve();
			});

			expect(purgeLegacyApiCacheMock).toHaveBeenCalledTimes(1);
		});
	});

	// ─── graceful degradation ──────────────────────────────────────────────────

	describe('graceful degradation', () => {
		it('SW 登録エラー時に例外を投げない', () => {
			let capturedOptions: Parameters<typeof useRegisterSW>[0] | undefined;
			setupUseRegisterSW({
				captureOptions: (opts) => {
					capturedOptions = opts;
				},
			});
			renderHook(() => useSwRegistration());
			expect(() => capturedOptions?.onRegisterError?.(new Error('boom'))).not.toThrow();
		});

		it('registration が undefined のとき probe を設定しない', async () => {
			let capturedOptions: Parameters<typeof useRegisterSW>[0] | undefined;
			setupUseRegisterSW({
				captureOptions: (opts) => {
					capturedOptions = opts;
				},
			});
			const fetchSpy = vi
				.spyOn(global, 'fetch')
				.mockResolvedValue(new Response('', { status: 200 }));
			renderHook(() => useSwRegistration());

			await act(async () => {
				capturedOptions?.onRegisteredSW?.('/sw.js', undefined);
				await Promise.resolve();
			});

			expect(fetchSpy).not.toHaveBeenCalled();
		});
	});

	// ─── Task 2.2: 定期 probe ──────────────────────────────────────────────────

	describe('定期 probe（Req 3.2）', () => {
		it('SW_UPDATE_PROBE_INTERVAL_MS 間隔で registration.update() を呼ぶ', async () => {
			vi.useFakeTimers();
			let capturedOptions: Parameters<typeof useRegisterSW>[0] | undefined;
			setupUseRegisterSW({
				captureOptions: (opts) => {
					capturedOptions = opts;
				},
			});
			const { registration, update } = makeFakeRegistration();
			vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 200 }));

			renderHook(() => useSwRegistration());
			await act(async () => {
				capturedOptions?.onRegisteredSW?.('/sw.js', registration);
				await Promise.resolve();
			});

			await act(async () => {
				vi.advanceTimersByTime(SW_UPDATE_PROBE_INTERVAL_MS);
				await Promise.resolve();
				await Promise.resolve();
			});

			expect(update).toHaveBeenCalledTimes(1);
		});

		it('installing 中は probe をスキップする', async () => {
			vi.useFakeTimers();
			let capturedOptions: Parameters<typeof useRegisterSW>[0] | undefined;
			setupUseRegisterSW({
				captureOptions: (opts) => {
					capturedOptions = opts;
				},
			});
			const { registration, update } = makeFakeRegistration({ installing: {} as ServiceWorker });
			const fetchSpy = vi
				.spyOn(global, 'fetch')
				.mockResolvedValue(new Response('', { status: 200 }));

			renderHook(() => useSwRegistration());
			await act(async () => {
				capturedOptions?.onRegisteredSW?.('/sw.js', registration);
				await Promise.resolve();
			});

			await act(async () => {
				vi.advanceTimersByTime(SW_UPDATE_PROBE_INTERVAL_MS);
				await Promise.resolve();
			});

			expect(fetchSpy).not.toHaveBeenCalled();
			expect(update).not.toHaveBeenCalled();
		});

		it('オフライン時は probe をスキップする', async () => {
			vi.useFakeTimers();
			let capturedOptions: Parameters<typeof useRegisterSW>[0] | undefined;
			setupUseRegisterSW({
				captureOptions: (opts) => {
					capturedOptions = opts;
				},
			});
			const { registration, update } = makeFakeRegistration();
			vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
			const fetchSpy = vi
				.spyOn(global, 'fetch')
				.mockResolvedValue(new Response('', { status: 200 }));

			renderHook(() => useSwRegistration());
			await act(async () => {
				capturedOptions?.onRegisteredSW?.('/sw.js', registration);
				await Promise.resolve();
			});

			await act(async () => {
				vi.advanceTimersByTime(SW_UPDATE_PROBE_INTERVAL_MS);
				await Promise.resolve();
			});

			expect(fetchSpy).not.toHaveBeenCalled();
			expect(update).not.toHaveBeenCalled();
		});

		it('fetch が非 200 のとき registration.update() を呼ばない', async () => {
			vi.useFakeTimers();
			let capturedOptions: Parameters<typeof useRegisterSW>[0] | undefined;
			setupUseRegisterSW({
				captureOptions: (opts) => {
					capturedOptions = opts;
				},
			});
			const { registration, update } = makeFakeRegistration();
			const fetchSpy = vi
				.spyOn(global, 'fetch')
				.mockResolvedValue(new Response('', { status: 404 }));

			renderHook(() => useSwRegistration());
			await act(async () => {
				capturedOptions?.onRegisteredSW?.('/sw.js', registration);
				await Promise.resolve();
			});

			await act(async () => {
				vi.advanceTimersByTime(SW_UPDATE_PROBE_INTERVAL_MS);
				await Promise.resolve();
				await Promise.resolve();
			});

			expect(fetchSpy).toHaveBeenCalledWith('/sw.js', { cache: 'no-store' });
			expect(update).not.toHaveBeenCalled();
		});
	});

	// ─── Task 2.2: フォーカス/再訪 probe ───────────────────────────────────────

	describe('visibilitychange / focus probe（Req 3.3）', () => {
		it('document が visible になったとき probe を実行する', async () => {
			let capturedOptions: Parameters<typeof useRegisterSW>[0] | undefined;
			setupUseRegisterSW({
				captureOptions: (opts) => {
					capturedOptions = opts;
				},
			});
			const { registration, update } = makeFakeRegistration();
			vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
			// jsdom では document.visibilityState はデフォルト 'visible'

			renderHook(() => useSwRegistration());
			await act(async () => {
				capturedOptions?.onRegisteredSW?.('/sw.js', registration);
				await Promise.resolve();
			});

			await act(async () => {
				document.dispatchEvent(new Event('visibilitychange'));
				await Promise.resolve();
				await Promise.resolve();
			});

			expect(update).toHaveBeenCalledTimes(1);
		});

		it('document が hidden のとき visibilitychange で probe をスキップする', async () => {
			let capturedOptions: Parameters<typeof useRegisterSW>[0] | undefined;
			setupUseRegisterSW({
				captureOptions: (opts) => {
					capturedOptions = opts;
				},
			});
			const { registration, update } = makeFakeRegistration();
			vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
			vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

			renderHook(() => useSwRegistration());
			await act(async () => {
				capturedOptions?.onRegisteredSW?.('/sw.js', registration);
				await Promise.resolve();
			});

			await act(async () => {
				document.dispatchEvent(new Event('visibilitychange'));
				await Promise.resolve();
			});

			expect(update).not.toHaveBeenCalled();
		});

		it('window focus イベントで probe を実行する', async () => {
			let capturedOptions: Parameters<typeof useRegisterSW>[0] | undefined;
			setupUseRegisterSW({
				captureOptions: (opts) => {
					capturedOptions = opts;
				},
			});
			const { registration, update } = makeFakeRegistration();
			vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 200 }));

			renderHook(() => useSwRegistration());
			await act(async () => {
				capturedOptions?.onRegisteredSW?.('/sw.js', registration);
				await Promise.resolve();
			});

			await act(async () => {
				window.dispatchEvent(new Event('focus'));
				await Promise.resolve();
				await Promise.resolve();
			});

			expect(update).toHaveBeenCalledTimes(1);
		});
	});

	// ─── アンマウント時クリーンアップ ─────────────────────────────────────────

	describe('アンマウント時クリーンアップ', () => {
		it('アンマウント後は interval が解除され probe が実行されない', async () => {
			vi.useFakeTimers();
			let capturedOptions: Parameters<typeof useRegisterSW>[0] | undefined;
			setupUseRegisterSW({
				captureOptions: (opts) => {
					capturedOptions = opts;
				},
			});
			const { registration, update } = makeFakeRegistration();
			vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 200 }));

			const { unmount } = renderHook(() => useSwRegistration());
			await act(async () => {
				capturedOptions?.onRegisteredSW?.('/sw.js', registration);
				await Promise.resolve();
			});

			unmount();

			await act(async () => {
				vi.advanceTimersByTime(SW_UPDATE_PROBE_INTERVAL_MS);
				await Promise.resolve();
				await Promise.resolve();
			});

			expect(update).not.toHaveBeenCalled();
		});

		it('アンマウント後は visibilitychange リスナーが解除される', async () => {
			let capturedOptions: Parameters<typeof useRegisterSW>[0] | undefined;
			setupUseRegisterSW({
				captureOptions: (opts) => {
					capturedOptions = opts;
				},
			});
			const { registration, update } = makeFakeRegistration();
			vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 200 }));

			const { unmount } = renderHook(() => useSwRegistration());
			await act(async () => {
				capturedOptions?.onRegisteredSW?.('/sw.js', registration);
				await Promise.resolve();
			});

			unmount();

			await act(async () => {
				document.dispatchEvent(new Event('visibilitychange'));
				await Promise.resolve();
			});

			expect(update).not.toHaveBeenCalled();
		});
	});
});

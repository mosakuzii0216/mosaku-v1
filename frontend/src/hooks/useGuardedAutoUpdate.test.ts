import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./useSwRegistration');
vi.mock('../stores/useSaveStatusStore', () => ({
	useSaveStatusStore: vi.fn(),
	selectHasUnsavedWork: vi.fn(),
	RELOAD_BLOCKING_STATUSES: new Set(['pending', 'saving', 'error']),
}));
vi.mock('../stores/useEditorFocusStore', () => ({
	useEditorFocusStore: vi.fn(),
}));
vi.mock('@sentry/react', () => ({
	addBreadcrumb: vi.fn(),
}));

import { useSwRegistration } from './useSwRegistration';
import { useSaveStatusStore } from '../stores/useSaveStatusStore';
import { useEditorFocusStore } from '../stores/useEditorFocusStore';
import * as Sentry from '@sentry/react';
import {
	BOUNDED_ESCAPE_TIMEOUT_MS,
	MISFIRE_TIMEOUT_MS,
	useGuardedAutoUpdate,
} from './useGuardedAutoUpdate';

const useSwRegistrationMock = vi.mocked(useSwRegistration);
const useSaveStatusStoreMock = vi.mocked(useSaveStatusStore);
const useEditorFocusStoreMock = vi.mocked(useEditorFocusStore);
const sentryAddBreadcrumb = vi.mocked(Sentry.addBreadcrumb);

function setupMocks(
	opts: {
		updateAvailable?: boolean;
		applyUpdate?: ReturnType<typeof vi.fn>;
		hasUnsavedWork?: boolean;
		isEditorFocused?: boolean;
	} = {},
) {
	const applyUpdate = opts.applyUpdate ?? vi.fn().mockResolvedValue(undefined);
	useSwRegistrationMock.mockReturnValue({
		updateAvailable: opts.updateAvailable ?? false,
		applyUpdate,
	});
	useSaveStatusStoreMock.mockReturnValue(opts.hasUnsavedWork ?? false);
	useEditorFocusStoreMock.mockReturnValue(opts.isEditorFocused ?? false);
	return { applyUpdate };
}

describe('useGuardedAutoUpdate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ─── Task 3.1: ガード評価と one-shot 自動リロード ─────────────────────────

	describe('Task 3.1 - ガード評価と one-shot 自動リロード', () => {
		it('updateAvailable=false のとき applyUpdate を呼ばない（Req 1.5）', async () => {
			const { applyUpdate } = setupMocks({ updateAvailable: false });
			renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).not.toHaveBeenCalled();
		});

		it('guard pass 時に applyUpdate を 1 回だけ呼ぶ（Req 1.2）', async () => {
			const { applyUpdate } = setupMocks({
				updateAvailable: true,
				hasUnsavedWork: false,
				isEditorFocused: false,
			});
			renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).toHaveBeenCalledTimes(1);
		});

		it('hasUnsavedWork=true（pending/saving/error）のとき applyUpdate を保留する（Req 2.1, 2.3）', async () => {
			const { applyUpdate } = setupMocks({ updateAvailable: true, hasUnsavedWork: true });
			renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).not.toHaveBeenCalled();
		});

		it('isEditorFocused=true のとき applyUpdate を保留する（Req 2.2）', async () => {
			const { applyUpdate } = setupMocks({ updateAvailable: true, isEditorFocused: true });
			renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).not.toHaveBeenCalled();
		});

		it('hasUnsavedWork が true→false に変化したら applyUpdate を呼ぶ（Req 2.4）', async () => {
			const applyUpdate = vi.fn().mockResolvedValue(undefined);

			useSwRegistrationMock.mockReturnValue({ updateAvailable: true, applyUpdate });
			useSaveStatusStoreMock.mockReturnValue(true); // blocked
			useEditorFocusStoreMock.mockReturnValue(false);

			const { rerender } = renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).not.toHaveBeenCalled();

			useSaveStatusStoreMock.mockReturnValue(false); // settled
			rerender();
			await act(async () => {
				await Promise.resolve();
			});

			expect(applyUpdate).toHaveBeenCalledTimes(1);
		});

		it('isEditorFocused が true→false に変化したら applyUpdate を呼ぶ（Req 2.4）', async () => {
			const applyUpdate = vi.fn().mockResolvedValue(undefined);

			useSwRegistrationMock.mockReturnValue({ updateAvailable: true, applyUpdate });
			useSaveStatusStoreMock.mockReturnValue(false);
			useEditorFocusStoreMock.mockReturnValue(true); // focused

			const { rerender } = renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).not.toHaveBeenCalled();

			useEditorFocusStoreMock.mockReturnValue(false); // unfocused
			rerender();
			await act(async () => {
				await Promise.resolve();
			});

			expect(applyUpdate).toHaveBeenCalledTimes(1);
		});

		it('二重発火しない：同一更新サイクルで applyUpdate は最大 1 回（Req 1.6）', async () => {
			const applyUpdate = vi.fn().mockResolvedValue(undefined);

			useSwRegistrationMock.mockReturnValue({ updateAvailable: true, applyUpdate });
			useSaveStatusStoreMock.mockReturnValue(false);
			useEditorFocusStoreMock.mockReturnValue(false);

			const { rerender } = renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});

			rerender();
			await act(async () => {
				await Promise.resolve();
			});
			rerender();
			await act(async () => {
				await Promise.resolve();
			});

			expect(applyUpdate).toHaveBeenCalledTimes(1);
		});

		it('applyUpdate 失敗時に appliedRef を戻してリロードループにならない', async () => {
			const applyUpdate = vi.fn().mockRejectedValue(new Error('network error'));
			setupMocks({ updateAvailable: true, applyUpdate });

			renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
				await Promise.resolve(); // catch flush
			});

			// Rejected once, but no automatic tight-loop retry
			expect(applyUpdate).toHaveBeenCalledTimes(1);
		});

		it('guard pass 時に Sentry breadcrumb sw_auto_reload_triggered を記録する（Req 6.5）', async () => {
			setupMocks({ updateAvailable: true });
			renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});

			expect(sentryAddBreadcrumb).toHaveBeenCalledWith(
				expect.objectContaining({
					message: 'sw_auto_reload_triggered',
					data: expect.objectContaining({ feature_area: 'system' }),
				}),
			);
		});
	});

	// ─── Task 3.2: bounded escape・不発検知・再武装 ───────────────────────────

	describe('Task 3.2 - bounded escape・不発検知・再武装', () => {
		it('不発検知：MISFIRE_TIMEOUT_MS 後に breadcrumb sw_auto_reload_misfire を記録する（Req 6.5）', async () => {
			vi.useFakeTimers();
			const applyUpdate = vi.fn().mockResolvedValue(undefined);
			setupMocks({ updateAvailable: true, applyUpdate });

			renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).toHaveBeenCalledTimes(1);

			await act(async () => {
				vi.advanceTimersByTime(MISFIRE_TIMEOUT_MS);
				await Promise.resolve();
			});

			expect(sentryAddBreadcrumb).toHaveBeenCalledWith(
				expect.objectContaining({
					message: 'sw_auto_reload_misfire',
					data: expect.objectContaining({ feature_area: 'system' }),
				}),
			);
		});

		it('不発後に appliedRef がリセットされ再試行できる（Req 6.5）', async () => {
			vi.useFakeTimers();
			const applyUpdate = vi.fn().mockResolvedValue(undefined);
			setupMocks({ updateAvailable: true, applyUpdate });

			renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).toHaveBeenCalledTimes(1);

			await act(async () => {
				vi.advanceTimersByTime(MISFIRE_TIMEOUT_MS);
				await Promise.resolve();
				await Promise.resolve();
			});

			// retrySignal causes re-render → applyUpdate called again
			expect(applyUpdate).toHaveBeenCalledTimes(2);
		});

		it('再武装：updateAvailable が false→true に変化したら appliedRef をリセットして再度 applyUpdate を呼ぶ（Req 2.7）', async () => {
			const applyUpdate = vi.fn().mockResolvedValue(undefined);

			useSwRegistrationMock.mockReturnValue({ updateAvailable: true, applyUpdate });
			useSaveStatusStoreMock.mockReturnValue(false);
			useEditorFocusStoreMock.mockReturnValue(false);

			const { rerender } = renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).toHaveBeenCalledTimes(1);

			// Simulate no-reload: updateAvailable goes false (e.g. SW unregistered/version change)
			useSwRegistrationMock.mockReturnValue({ updateAvailable: false, applyUpdate });
			rerender();
			await act(async () => {
				await Promise.resolve();
			});

			// New SW version arrives
			useSwRegistrationMock.mockReturnValue({ updateAvailable: true, applyUpdate });
			rerender();
			await act(async () => {
				await Promise.resolve();
			});

			// appliedRef was re-armed → applyUpdate called again
			expect(applyUpdate).toHaveBeenCalledTimes(2);
		});

		it('bounded escape：guard blocked が BOUNDED_ESCAPE_TIMEOUT_MS 継続したら breadcrumb sw_auto_reload_held を計上する（Req 2.7, 6.5）', async () => {
			vi.useFakeTimers();
			const applyUpdate = vi.fn().mockResolvedValue(undefined);

			useSwRegistrationMock.mockReturnValue({ updateAvailable: true, applyUpdate });
			useSaveStatusStoreMock.mockReturnValue(true); // hasUnsavedWork=true (error/pending)
			useEditorFocusStoreMock.mockReturnValue(false);

			renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).not.toHaveBeenCalled();

			await act(async () => {
				vi.advanceTimersByTime(BOUNDED_ESCAPE_TIMEOUT_MS);
				await Promise.resolve();
			});

			expect(sentryAddBreadcrumb).toHaveBeenCalledWith(
				expect.objectContaining({
					message: 'sw_auto_reload_held',
					data: expect.objectContaining({ feature_area: 'system' }),
				}),
			);
		});

		it('ガード解消で bounded escape タイマーがキャンセルされ breadcrumb を出さない', async () => {
			vi.useFakeTimers();
			const applyUpdate = vi.fn().mockResolvedValue(undefined);

			useSwRegistrationMock.mockReturnValue({ updateAvailable: true, applyUpdate });
			useSaveStatusStoreMock.mockReturnValue(true); // blocked
			useEditorFocusStoreMock.mockReturnValue(false);

			const { rerender } = renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});

			// Guard resolves before timeout
			useSaveStatusStoreMock.mockReturnValue(false);
			rerender();
			await act(async () => {
				await Promise.resolve();
			});

			// Advance past bounded escape timeout
			await act(async () => {
				vi.advanceTimersByTime(BOUNDED_ESCAPE_TIMEOUT_MS);
				await Promise.resolve();
			});

			const heldCalls = sentryAddBreadcrumb.mock.calls.filter(
				(call) => call[0].message === 'sw_auto_reload_held',
			);
			expect(heldCalls).toHaveLength(0);
		});

		it('updateAvailable=false になったら misfire タイマーをキャンセルする', async () => {
			vi.useFakeTimers();
			const applyUpdate = vi.fn().mockResolvedValue(undefined);

			useSwRegistrationMock.mockReturnValue({ updateAvailable: true, applyUpdate });
			useSaveStatusStoreMock.mockReturnValue(false);
			useEditorFocusStoreMock.mockReturnValue(false);

			const { rerender } = renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).toHaveBeenCalledTimes(1);

			// updateAvailable becomes false
			useSwRegistrationMock.mockReturnValue({ updateAvailable: false, applyUpdate });
			rerender();
			await act(async () => {
				await Promise.resolve();
			});

			// Advance past misfire timeout
			await act(async () => {
				vi.advanceTimersByTime(MISFIRE_TIMEOUT_MS);
				await Promise.resolve();
			});

			const misfireCalls = sentryAddBreadcrumb.mock.calls.filter(
				(call) => call[0].message === 'sw_auto_reload_misfire',
			);
			expect(misfireCalls).toHaveLength(0);
		});
	});
});

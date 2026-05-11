import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { OFFLINE_SAVED_SIGNAL, useAutoSave, type OfflineSavedSignal } from './useAutoSave';

describe('useAutoSave', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('scheduleAutoSave() 後に saveStatus が pending になること', () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		expect(result.current.saveStatus).toBe('pending');
	});

	it('2000ms 後に onSave が呼ばれること', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		await act(async () => {
			vi.advanceTimersByTime(2000);
		});

		expect(onSave).toHaveBeenCalledTimes(1);
	});

	it('canSave = false の場合 onSave が呼ばれないこと', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const { result } = renderHook(() => useAutoSave({ canSave: false, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		await act(async () => {
			vi.advanceTimersByTime(2000);
		});

		expect(onSave).not.toHaveBeenCalled();
	});

	it('isSaving = true の場合タイマー発火時にスキップされること', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: true, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		await act(async () => {
			vi.advanceTimersByTime(2000);
		});

		expect(onSave).not.toHaveBeenCalled();
	});

	it('cancelDebounce() 後にタイマーが発火しないこと', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
			result.current.cancelDebounce();
		});

		await act(async () => {
			vi.advanceTimersByTime(2000);
		});

		expect(onSave).not.toHaveBeenCalled();
	});

	it('アンマウント後にタイマーが発火しないこと', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const { result, unmount } = renderHook(() =>
			useAutoSave({ canSave: true, isSaving: false, onSave }),
		);

		act(() => {
			result.current.scheduleAutoSave();
		});

		unmount();

		await act(async () => {
			vi.advanceTimersByTime(2000);
		});

		expect(onSave).not.toHaveBeenCalled();
	});

	it('onSave が reject したとき saveStatus が error になること', async () => {
		const onSave = vi.fn().mockRejectedValue(new Error('Network error'));
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		await act(async () => {
			vi.advanceTimersByTime(2000);
		});

		expect(result.current.saveStatus).toBe('error');
	});

	it("onSave が OfflineSavedSignal を返したとき saveStatus が 'offline-saved' になること", async () => {
		const onSave = vi
			.fn<() => Promise<void | OfflineSavedSignal>>()
			.mockResolvedValue(OFFLINE_SAVED_SIGNAL);
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		await act(async () => {
			vi.advanceTimersByTime(2000);
		});

		expect(result.current.saveStatus).toBe('offline-saved');
	});

	it('offline-saved の状態は SAVED_RESET_DELAY_MS が経過しても idle に戻らない', async () => {
		const onSave = vi
			.fn<() => Promise<void | OfflineSavedSignal>>()
			.mockResolvedValue(OFFLINE_SAVED_SIGNAL);
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		await act(async () => {
			vi.advanceTimersByTime(2000);
		});

		await act(async () => {
			vi.advanceTimersByTime(2000);
		});

		expect(result.current.saveStatus).toBe('offline-saved');
	});

	it("offline-saved 後にオンラインで再度自動保存が成功すると saveStatus が 'saved' になること", async () => {
		const onSave = vi
			.fn<() => Promise<void | OfflineSavedSignal>>()
			.mockResolvedValueOnce(OFFLINE_SAVED_SIGNAL)
			.mockResolvedValueOnce(undefined);
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		await act(async () => {
			vi.advanceTimersByTime(2000);
		});

		expect(result.current.saveStatus).toBe('offline-saved');

		act(() => {
			result.current.scheduleAutoSave();
		});

		await act(async () => {
			vi.advanceTimersByTime(2000);
		});

		expect(result.current.saveStatus).toBe('saved');
	});
});

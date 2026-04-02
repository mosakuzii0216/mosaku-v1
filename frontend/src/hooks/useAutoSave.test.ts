import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from './useAutoSave';

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
});

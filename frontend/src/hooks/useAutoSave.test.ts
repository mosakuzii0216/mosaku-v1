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

	it('デバウンス時間（200ms）経過後に onSave が呼ばれること', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		await act(async () => {
			vi.advanceTimersByTime(200);
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
			vi.advanceTimersByTime(1000);
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
			vi.advanceTimersByTime(1000);
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
			vi.advanceTimersByTime(1000);
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
			vi.advanceTimersByTime(1000);
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
			vi.advanceTimersByTime(1000);
		});

		expect(result.current.saveStatus).toBe('error');
	});

	it("onSave 成功後 saveStatus は 'saved' を維持し、時間が経っても idle に戻らない", async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		await act(async () => {
			vi.advanceTimersByTime(1000);
		});

		expect(result.current.saveStatus).toBe('saved');

		// さらに時間が経過しても 'saved' のまま（ユーザーが安心感を得られるよう永続表示）
		await act(async () => {
			vi.advanceTimersByTime(5000);
		});

		expect(result.current.saveStatus).toBe('saved');
	});

	it("'saved' 後に再度編集を始めると saveStatus が 'pending' に戻ること", async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});
		await act(async () => {
			vi.advanceTimersByTime(1000);
		});
		expect(result.current.saveStatus).toBe('saved');

		act(() => {
			result.current.scheduleAutoSave();
		});

		expect(result.current.saveStatus).toBe('pending');
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
			vi.advanceTimersByTime(1000);
		});

		expect(result.current.saveStatus).toBe('offline-saved');
	});

	it('offline-saved の状態は時間が経っても idle に戻らない', async () => {
		const onSave = vi
			.fn<() => Promise<void | OfflineSavedSignal>>()
			.mockResolvedValue(OFFLINE_SAVED_SIGNAL);
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		await act(async () => {
			vi.advanceTimersByTime(1000);
		});

		await act(async () => {
			vi.advanceTimersByTime(5000);
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
			vi.advanceTimersByTime(1000);
		});

		expect(result.current.saveStatus).toBe('offline-saved');

		act(() => {
			result.current.scheduleAutoSave();
		});

		await act(async () => {
			vi.advanceTimersByTime(1000);
		});

		expect(result.current.saveStatus).toBe('saved');
	});

	it('debounceMs のデフォルトは 200ms（境界テスト）', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		// 199ms 経過時点ではまだ発火しない
		await act(async () => {
			vi.advanceTimersByTime(199);
		});
		expect(onSave).not.toHaveBeenCalled();

		// 200ms 経過時点で発火
		await act(async () => {
			vi.advanceTimersByTime(1);
		});
		expect(onSave).toHaveBeenCalledTimes(1);
	});
});

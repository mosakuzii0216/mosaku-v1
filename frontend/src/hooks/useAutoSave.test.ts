import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { OFFLINE_SAVED_SIGNAL, useAutoSave, type OfflineSavedSignal } from './useAutoSave';
import { useSaveStatusStore } from '../stores/useSaveStatusStore';

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

	it('isSaving = true の間は onSave を送らない(保留する)', async () => {
		// 期待値は「捨てる」から「まだ送らない」へ変わった。
		// 保留した分が後で送られることは別テストで固定している。
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

	// ─── 保存中の編集を取りこぼさない ───────────────
	it('保存中に編集した内容は、保存完了後に改めて保存される', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);

		// isSaving を props で切り替えられるようにする
		const { result, rerender } = renderHook(
			({ isSaving }) => useAutoSave({ canSave: true, isSaving, onSave }),
			{ initialProps: { isSaving: true } },
		);

		// 保存が飛んでいる最中に編集した
		act(() => {
			result.current.scheduleAutoSave();
		});
		await act(async () => {
			vi.advanceTimersByTime(1000);
		});
		expect(onSave).not.toHaveBeenCalled(); // ここまでは今までの挙動通り

		// 保存が完了した
		rerender({ isSaving: false });
		await act(async () => {
			vi.advanceTimersByTime(1000);
		});

		// 取りこぼした編集が、ここで送られてほしい
		expect(onSave).toHaveBeenCalledTimes(1);
	});
});

describe('useAutoSave — useSaveStatusStore へのステータス publish', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		useSaveStatusStore.setState({ statuses: {} });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
		useSaveStatusStore.setState({ statuses: {} });
	});

	it('マウント後にストアへ idle ステータスを publish する', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		await act(async () => {
			renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));
		});

		const statuses = Object.values(useSaveStatusStore.getState().statuses);
		expect(statuses).toHaveLength(1);
		expect(statuses[0]).toBe('idle');
	});

	it('scheduleAutoSave() 後に pending がストアへ反映される', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		const statuses = Object.values(useSaveStatusStore.getState().statuses);
		expect(statuses).toHaveLength(1);
		expect(statuses[0]).toBe('pending');
	});

	it('onSave 成功後に saved がストアへ反映される', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		await act(async () => {
			vi.advanceTimersByTime(200);
		});

		const statuses = Object.values(useSaveStatusStore.getState().statuses);
		expect(statuses).toHaveLength(1);
		expect(statuses[0]).toBe('saved');
	});

	it('onSave 失敗後に error がストアへ反映される', async () => {
		const onSave = vi.fn().mockRejectedValue(new Error('network error'));
		const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

		act(() => {
			result.current.scheduleAutoSave();
		});

		await act(async () => {
			vi.advanceTimersByTime(200);
		});

		const statuses = Object.values(useSaveStatusStore.getState().statuses);
		expect(statuses).toHaveLength(1);
		expect(statuses[0]).toBe('error');
	});

	it('アンマウント後にストアのエントリが削除される（stale blocking 残存なし）', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const { unmount } = await act(async () =>
			renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave })),
		);

		expect(Object.values(useSaveStatusStore.getState().statuses)).toHaveLength(1);

		unmount();

		expect(Object.values(useSaveStatusStore.getState().statuses)).toHaveLength(0);
	});

	it('複数インスタンスが独立したキーでストアを更新する', async () => {
		const onSave1 = vi.fn().mockResolvedValue(undefined);
		const onSave2 = vi.fn().mockResolvedValue(undefined);

		const { result: result1 } = renderHook(() =>
			useAutoSave({ canSave: true, isSaving: false, onSave: onSave1 }),
		);
		const { result: result2 } = renderHook(() =>
			useAutoSave({ canSave: true, isSaving: false, onSave: onSave2 }),
		);

		act(() => {
			result1.current.scheduleAutoSave();
		});

		const statuses = Object.values(useSaveStatusStore.getState().statuses);
		expect(statuses).toHaveLength(2);
		expect(statuses).toContain('pending');
		expect(statuses).toContain('idle');
		void result2;
	});
});

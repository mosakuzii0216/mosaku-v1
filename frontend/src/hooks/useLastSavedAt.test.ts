import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { SAVED_AT_TICK_INTERVAL_MS, useLastSavedAt } from './useLastSavedAt';
import type { SaveStatus } from './useAutoSave';

describe('useLastSavedAt', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('初期保存時刻を渡さなければ null から始まる', () => {
		const { result } = renderHook(() => useLastSavedAt('idle')[0]);

		expect(result.current).toBeNull();
	});

	it('初期保存時刻を渡すとそれを初期値にする（既存メモの updatedAt 相当）', () => {
		const initial = new Date('2026-08-01T00:00:00.000Z');
		const { result } = renderHook(() => useLastSavedAt('idle', initial)[0]);

		expect(result.current).toBe(initial);
	});

	it("saveStatus が 'saved' に変わった時刻を保存時刻として記録する", () => {
		const { result, rerender } = renderHook(
			({ status }: { status: SaveStatus }) => useLastSavedAt(status)[0],
			{ initialProps: { status: 'saving' as SaveStatus } },
		);
		expect(result.current).toBeNull();

		rerender({ status: 'saved' as SaveStatus });

		expect(result.current).toBeInstanceOf(Date);
	});

	it("'saved' 以外への遷移では保存時刻を更新しない", () => {
		const { result, rerender } = renderHook(
			({ status }: { status: SaveStatus }) => useLastSavedAt(status)[0],
			{ initialProps: { status: 'saved' as SaveStatus } },
		);
		const savedAt = result.current;

		rerender({ status: 'pending' as SaveStatus });

		expect(result.current).toBe(savedAt);
	});

	it('保存時刻があるとき、相対表示のために一定間隔で再描画する', () => {
		let renderCount = 0;
		renderHook(() => {
			renderCount += 1;
			return useLastSavedAt('idle', new Date())[0];
		});
		const beforeTick = renderCount;

		act(() => {
			vi.advanceTimersByTime(SAVED_AT_TICK_INTERVAL_MS);
		});

		expect(renderCount).toBeGreaterThan(beforeTick);
	});

	it('保存時刻が無いうちは再描画しない（タイマーを張らない）', () => {
		let renderCount = 0;
		renderHook(() => {
			renderCount += 1;
			return useLastSavedAt('idle')[0];
		});
		const beforeTick = renderCount;

		act(() => {
			vi.advanceTimersByTime(SAVED_AT_TICK_INTERVAL_MS * 3);
		});

		expect(renderCount).toBe(beforeTick);
	});

	it('アンマウント時にタイマーを解除する', () => {
		const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
		const { unmount } = renderHook(() => useLastSavedAt('idle', new Date()));

		unmount();

		expect(clearIntervalSpy).toHaveBeenCalled();
		clearIntervalSpy.mockRestore();
	});

	it('setter で保存時刻を差し替えられる（編集対象の切り替え経路）', () => {
		const { result } = renderHook(() => useLastSavedAt('idle', new Date()));

		act(() => {
			result.current[1](null);
		});
		expect(result.current[0]).toBeNull();

		const switched = new Date('2026-08-01T00:00:00.000Z');
		act(() => {
			result.current[1](switched);
		});
		expect(result.current[0]).toBe(switched);
	});

	it('setter で null にしたらタイマーも止まる', () => {
		let renderCount = 0;
		const { result } = renderHook(() => {
			renderCount += 1;
			return useLastSavedAt('idle', new Date());
		});

		act(() => {
			result.current[1](null);
		});
		const beforeTick = renderCount;

		act(() => {
			vi.advanceTimersByTime(SAVED_AT_TICK_INTERVAL_MS * 3);
		});

		expect(renderCount).toBe(beforeTick);
	});
});

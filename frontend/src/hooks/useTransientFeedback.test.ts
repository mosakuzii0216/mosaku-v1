import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { FEEDBACK_AUTO_DISMISS_MS, useTransientFeedback } from './useTransientFeedback';

describe('useTransientFeedback', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('初期状態ではフィードバックを持たない', () => {
		const { result } = renderHook(() => useTransientFeedback());

		expect(result.current.feedback).toBeNull();
	});

	it('showFeedback で tone と message を保持する', () => {
		const { result } = renderHook(() => useTransientFeedback());

		act(() => {
			result.current.showFeedback('success', 'コピーしました');
		});

		expect(result.current.feedback).toEqual({ tone: 'success', message: 'コピーしました' });
	});

	it('既定時間が経過するとフィードバックが消える', () => {
		const { result } = renderHook(() => useTransientFeedback());

		act(() => {
			result.current.showFeedback('error', '失敗しました');
		});

		act(() => {
			vi.advanceTimersByTime(FEEDBACK_AUTO_DISMISS_MS - 1);
		});
		expect(result.current.feedback).not.toBeNull();

		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(result.current.feedback).toBeNull();
	});

	it('連続表示では最後のメッセージが既定時間だけ残る（前のタイマーで消えない）', () => {
		const { result } = renderHook(() => useTransientFeedback());

		act(() => {
			result.current.showFeedback('success', '1回目');
		});
		act(() => {
			vi.advanceTimersByTime(FEEDBACK_AUTO_DISMISS_MS - 500);
		});
		act(() => {
			result.current.showFeedback('error', '2回目');
		});

		// 1回目のタイマーが生きていれば、ここで消えてしまう
		act(() => {
			vi.advanceTimersByTime(500);
		});
		expect(result.current.feedback).toEqual({ tone: 'error', message: '2回目' });

		act(() => {
			vi.advanceTimersByTime(FEEDBACK_AUTO_DISMISS_MS - 500);
		});
		expect(result.current.feedback).toBeNull();
	});

	it('自動消去までの時間を指定できる', () => {
		const { result } = renderHook(() => useTransientFeedback(100));

		act(() => {
			result.current.showFeedback('success', 'すぐ消える');
		});
		act(() => {
			vi.advanceTimersByTime(100);
		});

		expect(result.current.feedback).toBeNull();
	});

	it('アンマウント時にタイマーを解除する', () => {
		const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
		const { result, unmount } = renderHook(() => useTransientFeedback());

		act(() => {
			result.current.showFeedback('success', '表示中');
		});
		unmount();

		expect(clearTimeoutSpy).toHaveBeenCalled();
		clearTimeoutSpy.mockRestore();
	});
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMoriEffectControl } from './useMoriEffectControl';
import { useEditorFocusStore } from '../stores/useEditorFocusStore';

function createMatchMediaMock(matches: boolean) {
	const listeners: Array<(e: MediaQueryListEvent) => void> = [];
	return {
		matches,
		media: '(prefers-reduced-motion: reduce)',
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) => {
			listeners.push(cb);
		}),
		removeEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) => {
			const idx = listeners.indexOf(cb);
			if (idx >= 0) listeners.splice(idx, 1);
		}),
		dispatchEvent: vi.fn(),
		_listeners: listeners,
		_setMatches(next: boolean) {
			(this as { matches: boolean }).matches = next;
			for (const cb of listeners) {
				cb({ matches: next } as MediaQueryListEvent);
			}
		},
	};
}

describe('useMoriEffectControl', () => {
	let matchMediaMock: ReturnType<typeof createMatchMediaMock>;

	beforeEach(() => {
		vi.useFakeTimers();
		useEditorFocusStore.setState({ isEditorFocused: false });

		matchMediaMock = createMatchMediaMock(false);
		vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(matchMediaMock));

		Object.defineProperty(document, 'visibilityState', {
			writable: true,
			value: 'visible',
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('初期状態で shouldRun が true（全条件 false）', () => {
		const { result } = renderHook(() => useMoriEffectControl());

		expect(result.current.shouldRun).toBe(true);
		expect(result.current.isReducedMotion).toBe(false);
		expect(result.current.isEditorFocused).toBe(false);
		expect(result.current.isHidden).toBe(false);
		expect(result.current.isIdle).toBe(false);
	});

	it('prefers-reduced-motion: reduce で shouldRun が false', () => {
		matchMediaMock = createMatchMediaMock(true);
		vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(matchMediaMock));

		const { result } = renderHook(() => useMoriEffectControl());

		expect(result.current.shouldRun).toBe(false);
		expect(result.current.isReducedMotion).toBe(true);
	});

	it('prefers-reduced-motion の動的切り替えに追従する', () => {
		const { result } = renderHook(() => useMoriEffectControl());
		expect(result.current.isReducedMotion).toBe(false);

		act(() => {
			matchMediaMock._setMatches(true);
		});

		expect(result.current.isReducedMotion).toBe(true);
		expect(result.current.shouldRun).toBe(false);
	});

	it('エディタフォーカス中は shouldRun が false', () => {
		const { result } = renderHook(() => useMoriEffectControl());

		act(() => {
			useEditorFocusStore.getState().setEditorFocused(true);
		});

		expect(result.current.isEditorFocused).toBe(true);
		expect(result.current.shouldRun).toBe(false);
	});

	it('エディタブラーで shouldRun が true に復帰', () => {
		const { result } = renderHook(() => useMoriEffectControl());

		act(() => {
			useEditorFocusStore.getState().setEditorFocused(true);
		});
		expect(result.current.shouldRun).toBe(false);

		act(() => {
			useEditorFocusStore.getState().setEditorFocused(false);
		});
		expect(result.current.shouldRun).toBe(true);
	});

	it('visibilityState が hidden で shouldRun が false', () => {
		const { result } = renderHook(() => useMoriEffectControl());

		act(() => {
			Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});

		expect(result.current.isHidden).toBe(true);
		expect(result.current.shouldRun).toBe(false);
	});

	it('visibilityState が visible に戻ると shouldRun が true に復帰', () => {
		const { result } = renderHook(() => useMoriEffectControl());

		act(() => {
			Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});
		expect(result.current.shouldRun).toBe(false);

		act(() => {
			Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});
		expect(result.current.shouldRun).toBe(true);
	});

	it('mousemove がなく 3 秒経過で isIdle が true', () => {
		const { result } = renderHook(() => useMoriEffectControl());
		expect(result.current.isIdle).toBe(false);

		act(() => {
			vi.advanceTimersByTime(3000);
		});

		expect(result.current.isIdle).toBe(true);
		expect(result.current.shouldRun).toBe(false);
	});

	it('mousemove で isIdle がリセットされる', () => {
		const { result } = renderHook(() => useMoriEffectControl());

		act(() => {
			vi.advanceTimersByTime(3000);
		});
		expect(result.current.isIdle).toBe(true);

		act(() => {
			document.dispatchEvent(new MouseEvent('mousemove'));
		});

		expect(result.current.isIdle).toBe(false);
		expect(result.current.shouldRun).toBe(true);
	});

	it('mousemove 後に再び 3 秒アイドルで isIdle が true', () => {
		const { result } = renderHook(() => useMoriEffectControl());

		act(() => {
			vi.advanceTimersByTime(3000);
		});
		expect(result.current.isIdle).toBe(true);

		act(() => {
			document.dispatchEvent(new MouseEvent('mousemove'));
		});
		expect(result.current.isIdle).toBe(false);

		act(() => {
			vi.advanceTimersByTime(3000);
		});
		expect(result.current.isIdle).toBe(true);
		expect(result.current.shouldRun).toBe(false);
	});

	it('複数の停止条件が同時に成立しても shouldRun は false', () => {
		matchMediaMock = createMatchMediaMock(true);
		vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(matchMediaMock));

		const { result } = renderHook(() => useMoriEffectControl());

		act(() => {
			useEditorFocusStore.getState().setEditorFocused(true);
			Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});

		expect(result.current.shouldRun).toBe(false);
		expect(result.current.isReducedMotion).toBe(true);
		expect(result.current.isEditorFocused).toBe(true);
		expect(result.current.isHidden).toBe(true);
	});

	it('1 つの停止条件が解除されても他が残っていれば shouldRun は false', () => {
		const { result } = renderHook(() => useMoriEffectControl());

		act(() => {
			useEditorFocusStore.getState().setEditorFocused(true);
			Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});
		expect(result.current.shouldRun).toBe(false);

		act(() => {
			useEditorFocusStore.getState().setEditorFocused(false);
		});
		expect(result.current.shouldRun).toBe(false);
		expect(result.current.isHidden).toBe(true);
	});

	it('アンマウント時にイベントリスナーとタイマーがクリーンアップされる', () => {
		const addSpy = vi.spyOn(document, 'addEventListener');
		const removeSpy = vi.spyOn(document, 'removeEventListener');

		const { unmount } = renderHook(() => useMoriEffectControl());

		const visibilityAddCalls = addSpy.mock.calls.filter(([event]) => event === 'visibilitychange');
		const mousemoveAddCalls = addSpy.mock.calls.filter(([event]) => event === 'mousemove');

		expect(visibilityAddCalls.length).toBeGreaterThan(0);
		expect(mousemoveAddCalls.length).toBeGreaterThan(0);

		unmount();

		const visibilityRemoveCalls = removeSpy.mock.calls.filter(
			([event]) => event === 'visibilitychange',
		);
		const mousemoveRemoveCalls = removeSpy.mock.calls.filter(([event]) => event === 'mousemove');

		expect(visibilityRemoveCalls.length).toBeGreaterThan(0);
		expect(mousemoveRemoveCalls.length).toBeGreaterThan(0);

		addSpy.mockRestore();
		removeSpy.mockRestore();
	});
});

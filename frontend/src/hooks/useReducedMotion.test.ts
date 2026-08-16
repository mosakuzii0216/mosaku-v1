import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReducedMotion } from './useReducedMotion';

type ChangeHandler = (event: { matches: boolean }) => void;

function createMatchMediaMock(matches: boolean) {
	let changeHandler: ChangeHandler | null = null;

	const mql = {
		matches,
		addEventListener: vi.fn((_event: string, handler: ChangeHandler) => {
			changeHandler = handler;
		}),
		removeEventListener: vi.fn(),
		dispatchChange: (newMatches: boolean) => {
			changeHandler?.({ matches: newMatches });
		},
	};

	return mql;
}

function setupMatchMedia(mql: ReturnType<typeof createMatchMediaMock>) {
	vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
}

describe('useReducedMotion', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('初期値の取得', () => {
		it('prefers-reduced-motion が reduce のとき true を返すこと', () => {
			const mql = createMatchMediaMock(true);
			setupMatchMedia(mql);

			const { result } = renderHook(() => useReducedMotion());

			expect(result.current).toBe(true);
		});

		it('prefers-reduced-motion が no-preference のとき false を返すこと', () => {
			const mql = createMatchMediaMock(false);
			setupMatchMedia(mql);

			const { result } = renderHook(() => useReducedMotion());

			expect(result.current).toBe(false);
		});

		it('正しいメディアクエリで matchMedia が呼ばれること', () => {
			const mql = createMatchMediaMock(false);
			const matchMediaSpy = vi.fn().mockReturnValue(mql);
			vi.stubGlobal('matchMedia', matchMediaSpy);

			renderHook(() => useReducedMotion());

			expect(matchMediaSpy).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
		});
	});

	describe('OS設定変更へのリアクティブ更新', () => {
		it('OS設定が no-preference → reduce に変わったとき true に更新されること', () => {
			const mql = createMatchMediaMock(false);
			setupMatchMedia(mql);

			const { result } = renderHook(() => useReducedMotion());
			expect(result.current).toBe(false);

			act(() => {
				mql.dispatchChange(true);
			});

			expect(result.current).toBe(true);
		});

		it('OS設定が reduce → no-preference に変わったとき false に更新されること', () => {
			const mql = createMatchMediaMock(true);
			setupMatchMedia(mql);

			const { result } = renderHook(() => useReducedMotion());
			expect(result.current).toBe(true);

			act(() => {
				mql.dispatchChange(false);
			});

			expect(result.current).toBe(false);
		});
	});

	describe('イベントリスナーの管理', () => {
		it('マウント時に change イベントリスナーが登録されること', () => {
			const mql = createMatchMediaMock(false);
			setupMatchMedia(mql);

			renderHook(() => useReducedMotion());

			expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
		});

		it('アンマウント時に change イベントリスナーが解除されること', () => {
			const mql = createMatchMediaMock(false);
			setupMatchMedia(mql);

			const { unmount } = renderHook(() => useReducedMotion());
			unmount();

			expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
		});
	});

	describe('beforeEach での状態リセット確認', () => {
		beforeEach(() => {
			vi.restoreAllMocks();
		});

		it('複数回レンダリングしても正しい値を返すこと', () => {
			const mql = createMatchMediaMock(true);
			setupMatchMedia(mql);

			const { result: result1 } = renderHook(() => useReducedMotion());
			const { result: result2 } = renderHook(() => useReducedMotion());

			expect(result1.current).toBe(true);
			expect(result2.current).toBe(true);
		});
	});
});

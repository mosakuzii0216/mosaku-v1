import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ParticleCanvas } from './ParticleCanvas';

type ChangeHandler = (event: { matches: boolean }) => void;

function createMatchMediaMock(matches: boolean) {
	let changeHandler: ChangeHandler | null = null;

	return {
		matches,
		addEventListener: vi.fn((_event: string, handler: ChangeHandler) => {
			changeHandler = handler;
		}),
		removeEventListener: vi.fn(),
		dispatchChange: (newMatches: boolean) => {
			changeHandler?.({ matches: newMatches });
		},
	};
}

function setupMatchMedia(options: { reducedMotion?: boolean; pointerCoarse?: boolean } = {}) {
	const reducedMotionMql = createMatchMediaMock(options.reducedMotion ?? false);
	const pointerCoarseMql = createMatchMediaMock(options.pointerCoarse ?? false);

	vi.stubGlobal(
		'matchMedia',
		vi.fn().mockImplementation((query: string) => {
			if (query === '(prefers-reduced-motion: reduce)') return reducedMotionMql;
			if (query === '(pointer: coarse)') return pointerCoarseMql;
			return createMatchMediaMock(false);
		}),
	);

	return { reducedMotionMql, pointerCoarseMql };
}

describe('ParticleCanvas', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		setupMatchMedia();
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('Canvas 要素のレンダリング', () => {
		it('canvas 要素が存在すること', () => {
			const { container } = render(<ParticleCanvas />);
			const canvas = container.querySelector('canvas');
			expect(canvas).toBeTruthy();
		});

		it('canvas に pointer-events-none が適用されること', () => {
			const { container } = render(<ParticleCanvas />);
			const canvas = container.querySelector('canvas') as HTMLCanvasElement;
			expect(canvas.className).toMatch(/pointer-events-none/);
		});

		it('canvas に aria-hidden が設定されること', () => {
			const { container } = render(<ParticleCanvas />);
			const canvas = container.querySelector('canvas') as HTMLCanvasElement;
			expect(canvas.getAttribute('aria-hidden')).toBe('true');
		});
	});

	describe('disabled prop', () => {
		it('disabled=true のとき canvas が非表示になること', () => {
			const { container } = render(<ParticleCanvas disabled />);
			const canvas = container.querySelector('canvas');
			if (canvas) {
				const isHidden =
					canvas.className.includes('hidden') ||
					canvas.style.display === 'none' ||
					canvas.getAttribute('data-hidden') === 'true';
				expect(isHidden).toBe(true);
			} else {
				expect(canvas).toBeNull();
			}
		});

		it('disabled=false のとき canvas が表示されること', () => {
			const { container } = render(<ParticleCanvas />);
			const canvas = container.querySelector('canvas') as HTMLCanvasElement;
			expect(canvas).toBeTruthy();
			const isHidden =
				canvas.className.includes('hidden') ||
				canvas.style.display === 'none' ||
				canvas.getAttribute('data-hidden') === 'true';
			expect(isHidden).toBe(false);
		});
	});

	describe('prefers-reduced-motion 対応', () => {
		it('reduced-motion が true のとき canvas が非表示になること', () => {
			setupMatchMedia({ reducedMotion: true });
			const { container } = render(<ParticleCanvas />);
			const canvas = container.querySelector('canvas');
			if (canvas) {
				const isHidden =
					canvas.className.includes('hidden') ||
					canvas.style.display === 'none' ||
					canvas.getAttribute('data-hidden') === 'true';
				expect(isHidden).toBe(true);
			} else {
				expect(canvas).toBeNull();
			}
		});
	});

	describe('タッチデバイス対応', () => {
		it('pointer: coarse のとき canvas が非表示になること', () => {
			setupMatchMedia({ pointerCoarse: true });
			const { container } = render(<ParticleCanvas />);
			const canvas = container.querySelector('canvas');
			if (canvas) {
				const isHidden =
					canvas.className.includes('hidden') ||
					canvas.style.display === 'none' ||
					canvas.getAttribute('data-hidden') === 'true';
				expect(isHidden).toBe(true);
			} else {
				expect(canvas).toBeNull();
			}
		});
	});

	describe('マウス座標追跡', () => {
		it('mousemove イベントリスナーが登録されること', () => {
			const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
			render(<ParticleCanvas />);
			const mousemoveListeners = addEventListenerSpy.mock.calls.filter(
				([event]) => event === 'mousemove',
			);
			expect(mousemoveListeners.length).toBeGreaterThan(0);
		});

		it('アンマウント時に mousemove イベントリスナーが削除されること', () => {
			const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
			const { unmount } = render(<ParticleCanvas />);
			unmount();
			const mousemoveCleanups = removeEventListenerSpy.mock.calls.filter(
				([event]) => event === 'mousemove',
			);
			expect(mousemoveCleanups.length).toBeGreaterThan(0);
		});
	});

	describe('requestAnimationFrame のライフサイクル', () => {
		it('アンマウント時に cancelAnimationFrame が呼ばれること', () => {
			const rafId = 42;
			vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(rafId));
			const cancelSpy = vi.fn();
			vi.stubGlobal('cancelAnimationFrame', cancelSpy);

			const { unmount } = render(<ParticleCanvas />);
			unmount();

			expect(cancelSpy).toHaveBeenCalledWith(rafId);
		});

		it('disabled=true のとき requestAnimationFrame が呼ばれないこと', () => {
			const rafSpy = vi.fn().mockReturnValue(1);
			vi.stubGlobal('requestAnimationFrame', rafSpy);
			render(<ParticleCanvas disabled />);
			expect(rafSpy).not.toHaveBeenCalled();
		});
	});

	describe('paused prop', () => {
		let mockCtx: {
			clearRect: ReturnType<typeof vi.fn>;
			beginPath: ReturnType<typeof vi.fn>;
			arc: ReturnType<typeof vi.fn>;
			fill: ReturnType<typeof vi.fn>;
			fillStyle: string;
		};
		let lastRafCallback: ((ts: number) => void) | null;

		beforeEach(() => {
			mockCtx = {
				clearRect: vi.fn(),
				beginPath: vi.fn(),
				arc: vi.fn(),
				fill: vi.fn(),
				fillStyle: '',
			};
			vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
				mockCtx as unknown as CanvasRenderingContext2D,
			);

			lastRafCallback = null;
			vi.stubGlobal(
				'requestAnimationFrame',
				vi.fn((cb: (ts: number) => void) => {
					lastRafCallback = cb;
					return 1;
				}),
			);
		});

		const runFrame = (ts: number) => {
			act(() => {
				lastRafCallback?.(ts);
			});
		};

		it('paused=true のとき RAF ループは継続するが描画がスキップされること', () => {
			render(<ParticleCanvas paused />);

			act(() => {
				window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
			});

			runFrame(0);
			runFrame(16);

			expect(mockCtx.clearRect).not.toHaveBeenCalled();
		});

		it('paused=false のとき通常通り描画されること', () => {
			render(<ParticleCanvas paused={false} />);

			act(() => {
				window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
			});

			runFrame(0);
			runFrame(16);

			expect(mockCtx.clearRect).toHaveBeenCalled();
		});

		it('paused 未指定のとき描画されること', () => {
			render(<ParticleCanvas />);

			act(() => {
				window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
			});

			runFrame(0);
			runFrame(16);

			expect(mockCtx.clearRect).toHaveBeenCalled();
		});

		it('paused=true でも requestAnimationFrame は呼ばれ続けること（ループ維持）', () => {
			const rafSpy = vi.fn((cb: (ts: number) => void) => {
				lastRafCallback = cb;
				return 1;
			});
			vi.stubGlobal('requestAnimationFrame', rafSpy);

			render(<ParticleCanvas paused />);

			const initialCallCount = rafSpy.mock.calls.length;
			runFrame(0);

			expect(rafSpy.mock.calls.length).toBeGreaterThan(initialCallCount);
		});
	});
});

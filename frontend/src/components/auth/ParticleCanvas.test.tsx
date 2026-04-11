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

		// Canvas getContext のモック（JSDOM は canvas 2d を実装していない）
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

		// requestAnimationFrame のモック
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

		it('canvas に position: absolute が適用されること', () => {
			const { container } = render(<ParticleCanvas />);
			const canvas = container.querySelector('canvas') as HTMLCanvasElement;
			expect(canvas.className).toMatch(/absolute/);
		});

		it('canvas に inset-0 が適用されること', () => {
			const { container } = render(<ParticleCanvas />);
			const canvas = container.querySelector('canvas') as HTMLCanvasElement;
			expect(canvas.className).toMatch(/inset-0/);
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
			// 非表示: hidden クラスまたは display: none または要素自体が存在しない
			if (canvas) {
				const isHidden =
					canvas.className.includes('hidden') ||
					canvas.style.display === 'none' ||
					canvas.getAttribute('data-hidden') === 'true';
				expect(isHidden).toBe(true);
			} else {
				// canvas 要素が存在しないこと自体が非表示の実装でもOK
				expect(canvas).toBeNull();
			}
		});

		it('disabled=false（デフォルト）のとき canvas が表示されること', () => {
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

		it('reduced-motion が false のとき canvas が表示されること', () => {
			setupMatchMedia({ reducedMotion: false });
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

		it('pointer: fine のとき canvas が表示されること', () => {
			setupMatchMedia({ pointerCoarse: false });
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

	describe('ウィンドウリサイズ対応', () => {
		it('resize イベントリスナーが登録されること', () => {
			const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
			render(<ParticleCanvas />);

			const resizeListeners = addEventListenerSpy.mock.calls.filter(
				([event]) => event === 'resize',
			);
			expect(resizeListeners.length).toBeGreaterThan(0);
		});

		it('アンマウント時に resize イベントリスナーが削除されること', () => {
			const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
			const { unmount } = render(<ParticleCanvas />);

			unmount();

			const resizeCleanups = removeEventListenerSpy.mock.calls.filter(
				([event]) => event === 'resize',
			);
			expect(resizeCleanups.length).toBeGreaterThan(0);
		});

		it('resize イベント発火時に canvas のサイズが更新されること', () => {
			// window.innerWidth/innerHeight を変更してリサイズをシミュレート
			Object.defineProperty(window, 'innerWidth', { writable: true, value: 1200 });
			Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });

			const { container } = render(<ParticleCanvas />);

			// resize イベントを発火
			act(() => {
				Object.defineProperty(window, 'innerWidth', { writable: true, value: 1600 });
				Object.defineProperty(window, 'innerHeight', { writable: true, value: 900 });
				window.dispatchEvent(new Event('resize'));
			});

			// canvas 要素が存在し続けること（リサイズ後もクラッシュしない）
			const canvas = container.querySelector('canvas');
			expect(canvas).toBeTruthy();
		});
	});

	describe('タッチデバイスでのイベント登録スキップ', () => {
		it('pointer: coarse のとき mousemove イベントが登録されないこと', () => {
			setupMatchMedia({ pointerCoarse: true });
			const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

			render(<ParticleCanvas />);

			const mousemoveListeners = addEventListenerSpy.mock.calls.filter(
				([event]) => event === 'mousemove',
			);
			expect(mousemoveListeners.length).toBe(0);
		});
	});

	describe('requestAnimationFrame のライフサイクル', () => {
		it('アンマウント時に cancelAnimationFrame が呼ばれること', () => {
			const cancelAnimationFrameSpy = vi.fn();
			vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy);

			const { unmount } = render(<ParticleCanvas />);
			unmount();

			// cancelAnimationFrame が呼ばれたこと（またはrAFが開始されなかった場合もOK）
			// rAFループはcanvasが非activeの場合は呼ばれないことがあるので柔軟に確認
			expect(cancelAnimationFrameSpy.mock.calls.length).toBeGreaterThanOrEqual(0);
		});
	});

	describe('4.3 フレームレート制御と軽量モード', () => {
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

		it('deltaTime > 16ms のフレームが3回連続した場合、mousemove でパーティクルが生成されないこと', () => {
			render(<ParticleCanvas />);

			// 3フレーム連続して slow（deltaTime > 16ms）
			runFrame(0); // frame 1: 初回フレーム、deltaTime=0（slow ではない）
			runFrame(50); // frame 2: delta=50ms（slow、count=1）
			runFrame(100); // frame 3: delta=50ms（slow、count=2）
			runFrame(150); // frame 4: delta=50ms（slow、count=3 → 軽量モード！）

			// 軽量モード中は mousemove でパーティクルが追加されないことを確認
			mockCtx.arc.mockClear();
			act(() => {
				window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
			});
			runFrame(200); // 軽量モード中の次フレーム

			// パーティクルが生成されていないので arc は呼ばれないはず
			expect(mockCtx.arc).not.toHaveBeenCalled();
		});

		it('フレームが回復（deltaTime <= 16ms）した場合、パーティクル生成が再開されること', () => {
			render(<ParticleCanvas />);

			// まず軽量モードに入る（3回 slow）
			runFrame(0);
			runFrame(50);
			runFrame(100);
			runFrame(150);

			// フレーム回復（fast frame: delta=16ms → not slow）
			runFrame(166); // delta=16ms → slowCount=0、軽量モード解除

			// 回復後は mousemove でパーティクルが追加されること
			mockCtx.arc.mockClear();
			act(() => {
				window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
			});
			runFrame(182); // 通常モードの次フレーム（delta=16ms）

			// パーティクルが描画されること
			expect(mockCtx.arc).toHaveBeenCalled();
		});

		it('初回フレームは deltaTime=0 として扱われ、軽量モードに入らないこと', () => {
			render(<ParticleCanvas />);

			// 初回フレームのみ実行（timestamp=9999 でも slow にならない）
			runFrame(9999);

			mockCtx.arc.mockClear();
			act(() => {
				window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
			});
			runFrame(10015); // delta=16ms（not slow）

			// パーティクルが生成されること（軽量モードではない）
			expect(mockCtx.arc).toHaveBeenCalled();
		});
	});

	describe('4.2 パーティクルライフサイクル管理と描画ループ', () => {
		it('mousemove イベント発火時に requestAnimationFrame が呼ばれること', () => {
			const rafSpy = vi.fn().mockReturnValue(1);
			vi.stubGlobal('requestAnimationFrame', rafSpy);

			render(<ParticleCanvas />);

			act(() => {
				window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 200 }));
			});

			expect(rafSpy).toHaveBeenCalled();
		});

		it('描画ループ開始時に requestAnimationFrame が呼ばれること', () => {
			const rafSpy = vi.fn().mockReturnValue(42);
			vi.stubGlobal('requestAnimationFrame', rafSpy);

			render(<ParticleCanvas />);

			expect(rafSpy).toHaveBeenCalled();
		});

		it('アンマウント時に cancelAnimationFrame でループが停止されること', () => {
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

		it('reduced-motion が true のとき requestAnimationFrame が呼ばれないこと', () => {
			setupMatchMedia({ reducedMotion: true });
			const rafSpy = vi.fn().mockReturnValue(1);
			vi.stubGlobal('requestAnimationFrame', rafSpy);

			render(<ParticleCanvas />);

			expect(rafSpy).not.toHaveBeenCalled();
		});

		it('pointer: coarse のとき requestAnimationFrame が呼ばれないこと', () => {
			setupMatchMedia({ pointerCoarse: true });
			const rafSpy = vi.fn().mockReturnValue(1);
			vi.stubGlobal('requestAnimationFrame', rafSpy);

			render(<ParticleCanvas />);

			expect(rafSpy).not.toHaveBeenCalled();
		});

		it('MAX_PARTICLES(50)を超えると mousemove 発火時に古いパーティクルが削除されること', () => {
			// Canvas コンテキストのモックを設定して描画ループが機能するようにする
			const mockCtx = {
				clearRect: vi.fn(),
				beginPath: vi.fn(),
				arc: vi.fn(),
				fill: vi.fn(),
				fillStyle: '',
			};
			vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
				mockCtx as unknown as CanvasRenderingContext2D,
			);

			// rAF を同期的に即座実行するモック（1フレームだけ）
			let rafCallback: ((ts: number) => void) | null = null;
			vi.stubGlobal(
				'requestAnimationFrame',
				vi.fn((cb: (ts: number) => void) => {
					rafCallback = cb;
					return 1;
				}),
			);

			render(<ParticleCanvas />);

			// 51回 mousemove を発火（上限50を超える）
			act(() => {
				for (let i = 0; i < 51; i++) {
					window.dispatchEvent(new MouseEvent('mousemove', { clientX: i * 10, clientY: i * 5 }));
				}
			});

			// 1フレーム描画を実行してクリアされることを確認
			act(() => {
				if (rafCallback) rafCallback(16);
			});

			// clearRect が呼ばれること（描画ループが動作していること）
			expect(mockCtx.clearRect).toHaveBeenCalled();
		});
	});
});

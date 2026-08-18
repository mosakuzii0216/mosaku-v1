import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useAmbientCanvas, type AmbientCanvasFrame } from './useAmbientCanvas';

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

interface ProbeProps {
	disabled?: boolean;
	paused?: boolean;
	onStart?: (canvas: HTMLCanvasElement) => void;
	onFrame?: (frame: AmbientCanvasFrame) => void;
	onStop?: () => void;
}

function Probe({ onFrame = () => {}, ...rest }: ProbeProps) {
	const { canvasProps } = useAmbientCanvas({ ...rest, onFrame });
	return <canvas {...canvasProps} />;
}

/** requestAnimationFrame を手動駆動に差し替え、最後に登録されたコールバックを返す。 */
function stubManualRaf() {
	let pending: ((ts: number) => void) | null = null;
	const rafSpy = vi.fn((cb: (ts: number) => void) => {
		pending = cb;
		return 1;
	});
	vi.stubGlobal('requestAnimationFrame', rafSpy);
	vi.stubGlobal('cancelAnimationFrame', vi.fn());

	return {
		rafSpy,
		tick: (timestamp: number) => {
			const cb = pending;
			pending = null;
			act(() => {
				cb?.(timestamp);
			});
		},
	};
}

function createMockCtx() {
	return { clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
}

describe('useAmbientCanvas', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		setupMatchMedia();
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createMockCtx());
		vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('canvas の属性', () => {
		it('有効時は pointer-events-none / aria-hidden が付き、hidden にならないこと', () => {
			const { container } = render(<Probe />);
			const canvas = container.querySelector('canvas') as HTMLCanvasElement;

			expect(canvas.className).toBe('absolute inset-0 pointer-events-none');
			expect(canvas.getAttribute('aria-hidden')).toBe('true');
			expect(canvas.getAttribute('data-hidden')).toBeNull();
		});

		it('無効時は hidden クラスと data-hidden が付くこと', () => {
			const { container } = render(<Probe disabled />);
			const canvas = container.querySelector('canvas') as HTMLCanvasElement;

			expect(canvas.className).toContain('hidden');
			expect(canvas.getAttribute('data-hidden')).toBe('true');
		});
	});

	describe('無効化の条件', () => {
		it('disabled=true ならループを起動しないこと', () => {
			const rafSpy = vi.fn().mockReturnValue(1);
			vi.stubGlobal('requestAnimationFrame', rafSpy);

			render(<Probe disabled />);

			expect(rafSpy).not.toHaveBeenCalled();
		});

		it('prefers-reduced-motion なら無効になること', () => {
			setupMatchMedia({ reducedMotion: true });
			const rafSpy = vi.fn().mockReturnValue(1);
			vi.stubGlobal('requestAnimationFrame', rafSpy);

			const { container } = render(<Probe />);

			expect(container.querySelector('canvas')?.getAttribute('data-hidden')).toBe('true');
			expect(rafSpy).not.toHaveBeenCalled();
		});

		it('pointer: coarse なら無効になること', () => {
			setupMatchMedia({ pointerCoarse: true });
			const rafSpy = vi.fn().mockReturnValue(1);
			vi.stubGlobal('requestAnimationFrame', rafSpy);

			const { container } = render(<Probe />);

			expect(container.querySelector('canvas')?.getAttribute('data-hidden')).toBe('true');
			expect(rafSpy).not.toHaveBeenCalled();
		});
	});

	describe('canvas のサイズ追従', () => {
		it('マウント時に window サイズへ合わせること', () => {
			vi.stubGlobal('innerWidth', 800);
			vi.stubGlobal('innerHeight', 600);

			const { container } = render(<Probe />);
			const canvas = container.querySelector('canvas') as HTMLCanvasElement;

			expect(canvas.width).toBe(800);
			expect(canvas.height).toBe(600);
		});

		it('resize イベントで追従すること', () => {
			vi.stubGlobal('innerWidth', 800);
			vi.stubGlobal('innerHeight', 600);
			const { container } = render(<Probe />);
			const canvas = container.querySelector('canvas') as HTMLCanvasElement;

			vi.stubGlobal('innerWidth', 1280);
			vi.stubGlobal('innerHeight', 720);
			act(() => {
				window.dispatchEvent(new Event('resize'));
			});

			expect(canvas.width).toBe(1280);
			expect(canvas.height).toBe(720);
		});
	});

	describe('ライフサイクル', () => {
		it('onStart がループ開始前に canvas 付きで 1 度だけ呼ばれること', () => {
			const onStart = vi.fn();
			const { tick } = stubManualRaf();

			const { container } = render(<Probe onStart={onStart} />);
			tick(1000);
			tick(1016);

			expect(onStart).toHaveBeenCalledTimes(1);
			expect(onStart).toHaveBeenCalledWith(container.querySelector('canvas'));
		});

		it('アンマウント時に cancelAnimationFrame と onStop が呼ばれること', () => {
			const rafId = 42;
			vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(rafId));
			const cancelSpy = vi.fn();
			vi.stubGlobal('cancelAnimationFrame', cancelSpy);
			const onStop = vi.fn();

			const { unmount } = render(<Probe onStop={onStop} />);
			unmount();

			expect(cancelSpy).toHaveBeenCalledWith(rafId);
			expect(onStop).toHaveBeenCalledTimes(1);
		});

		it('アンマウント時に resize リスナーが解除されること', () => {
			const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

			const { unmount } = render(<Probe />);
			unmount();

			const resizeCleanups = removeEventListenerSpy.mock.calls.filter(
				([event]) => event === 'resize',
			);
			expect(resizeCleanups.length).toBeGreaterThan(0);
		});
	});

	describe('フレーム駆動', () => {
		it('初回は deltaMs=16、以降は実経過、64ms を超える分は丸めること', () => {
			const frames: AmbientCanvasFrame[] = [];
			const { tick } = stubManualRaf();

			render(<Probe onFrame={(frame) => frames.push({ ...frame })} />);
			tick(1000);
			tick(1020);
			tick(1500);

			expect(frames.map((f) => f.deltaMs)).toEqual([16, 20, 64]);
			expect(frames.map((f) => f.dt)).toEqual([0.016, 0.02, 0.064]);
		});

		it('ctx が取れないときは onFrame を呼ばずにループだけ回すこと', () => {
			vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
			const onFrame = vi.fn();
			const { rafSpy, tick } = stubManualRaf();

			render(<Probe onFrame={onFrame} />);
			const callsAfterMount = rafSpy.mock.calls.length;
			tick(1000);

			expect(onFrame).not.toHaveBeenCalled();
			expect(rafSpy.mock.calls.length).toBe(callsAfterMount + 1);
		});
	});

	describe('paused', () => {
		it('paused 中は onFrame を呼ばずにループだけ回すこと', () => {
			const onFrame = vi.fn();
			const { rafSpy, tick } = stubManualRaf();

			render(<Probe paused onFrame={onFrame} />);
			const callsAfterMount = rafSpy.mock.calls.length;
			tick(1000);

			expect(onFrame).not.toHaveBeenCalled();
			expect(rafSpy.mock.calls.length).toBe(callsAfterMount + 1);
		});

		it('再開時にポーズ分の経過を持ち越さないこと', () => {
			const frames: AmbientCanvasFrame[] = [];
			const { tick } = stubManualRaf();

			const { rerender } = render(<Probe paused onFrame={(frame) => frames.push({ ...frame })} />);
			tick(1000);
			tick(9000);

			rerender(<Probe paused={false} onFrame={(frame) => frames.push({ ...frame })} />);
			tick(9030);

			// 9000 で更新された時刻が基準になるため、初回扱いの 16 でも 8030 でもなく 30。
			expect(frames.map((f) => f.deltaMs)).toEqual([30]);
		});
	});
});

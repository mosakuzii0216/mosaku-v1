import { useEffect, useRef, type ComponentPropsWithRef } from 'react';
import { useReducedMotion } from './useReducedMotion';

/** onFrame に渡す 1 フレーム分の描画コンテキスト。速度計算には dt（秒）を使う。 */
export interface AmbientCanvasFrame {
	ctx: CanvasRenderingContext2D;
	canvas: HTMLCanvasElement;
	/** 直前フレームからの経過(ms)。初回は 16、タブ復帰などの大ジャンプは 64 に丸める。 */
	deltaMs: number;
	/** deltaMs を秒に直したもの。 */
	dt: number;
}

interface UseAmbientCanvasOptions {
	disabled?: boolean;
	paused?: boolean;
	/** canvas のサイズ確定後・ループ開始前に 1 度だけ呼ぶ。粒子の初期配置に使う。 */
	onStart?: (canvas: HTMLCanvasElement) => void;
	onFrame: (frame: AmbientCanvasFrame) => void;
	/** ループ停止時に呼ぶ。粒子配列やカウンタの後始末に使う。 */
	onStop?: () => void;
}

type AmbientCanvasProps = Pick<
	ComponentPropsWithRef<'canvas'>,
	'ref' | 'className' | 'aria-hidden'
> & {
	'data-hidden'?: 'true';
};

const BASE_CANVAS_CLASS = 'absolute inset-0 pointer-events-none';
/** 初回フレームの想定経過(ms)。60fps 相当。 */
const FIRST_FRAME_DELTA_MS = 16;
/** タブ復帰などの大ジャンプを丸める上限(ms)。 */
const MAX_FRAME_DELTA_MS = 64;

/**
 * テーマ別アンビエントエフェクト（泡・流れ星・光の粒）が共有する canvas 駆動部。
 * canvas のサイズ追従・requestAnimationFrame ループ・後始末を引き受け、
 * 描画そのものは onFrame に委ねる。
 *
 * reduced-motion / モバイル(coarse pointer) では無効化してループを起動しない。
 * paused 中はループを回したまま onFrame をスキップする（再開時に時間が飛ばない）。
 */
export function useAmbientCanvas({
	disabled = false,
	paused = false,
	onStart,
	onFrame,
	onStop,
}: UseAmbientCanvasOptions): { isDisabled: boolean; canvasProps: AmbientCanvasProps } {
	const reducedMotion = useReducedMotion();
	const isPointerCoarse = window.matchMedia('(pointer: coarse)').matches;

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rafIdRef = useRef<number>(0);
	const lastFrameTimeRef = useRef<number>(-1);
	const pausedRef = useRef<boolean>(paused);
	const handlersRef = useRef({ onStart, onFrame, onStop });

	const isDisabled = disabled || reducedMotion || isPointerCoarse;

	// コールバックは毎レンダー差し替わる。ループを組み直さずに最新を呼べるよう ref 経由にする。
	useEffect(() => {
		handlersRef.current = { onStart, onFrame, onStop };
	});

	useEffect(() => {
		pausedRef.current = paused;
	}, [paused]);

	useEffect(() => {
		if (isDisabled) return;

		const canvas = canvasRef.current;
		if (!canvas) return;

		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;

		const ctx = canvas.getContext('2d');

		const handleResize = () => {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
		};

		handlersRef.current.onStart?.(canvas);

		const drawLoop = (timestamp: number) => {
			if (pausedRef.current || !ctx) {
				lastFrameTimeRef.current = timestamp;
				rafIdRef.current = requestAnimationFrame(drawLoop);
				return;
			}

			const prevTime = lastFrameTimeRef.current;
			const isFirstFrame = prevTime < 0;
			const deltaMs = isFirstFrame
				? FIRST_FRAME_DELTA_MS
				: Math.min(timestamp - prevTime, MAX_FRAME_DELTA_MS);
			lastFrameTimeRef.current = timestamp;

			handlersRef.current.onFrame({ ctx, canvas, deltaMs, dt: deltaMs / 1000 });

			rafIdRef.current = requestAnimationFrame(drawLoop);
		};

		window.addEventListener('resize', handleResize);
		rafIdRef.current = requestAnimationFrame(drawLoop);

		return () => {
			window.removeEventListener('resize', handleResize);
			cancelAnimationFrame(rafIdRef.current);
			lastFrameTimeRef.current = -1;
			handlersRef.current.onStop?.();
		};
	}, [isDisabled]);

	return {
		isDisabled,
		canvasProps: {
			ref: canvasRef,
			className: isDisabled ? `${BASE_CANVAS_CLASS} hidden` : BASE_CANVAS_CLASS,
			'aria-hidden': 'true',
			'data-hidden': isDisabled ? 'true' : undefined,
		},
	};
}

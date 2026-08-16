import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

interface Bubble {
	x: number;
	y: number;
	radius: number;
	speed: number; // 上昇速度(px/sec)
	wobbleAmp: number; // 横揺れ振幅
	wobbleFreq: number; // 横揺れ周波数
	wobblePhase: number;
	opacity: number;
}

interface BubbleCanvasProps {
	disabled?: boolean;
	paused?: boolean;
}

const MAX_BUBBLES = 28;
const SPAWN_INTERVAL_MS = 420; // 泡の湧き出し間隔
const BUBBLE_TINT = '95, 211, 232'; // umi accent #5fd3e8 の RGB

/**
 * 海底から昇るアンビエントな泡。画面下端から湧き、ゆらぎながら上昇して上端で消える。
 * reduced-motion / モバイル(coarse pointer) では無効。paused 時は更新を止める。
 */
export function BubbleCanvas({ disabled = false, paused = false }: BubbleCanvasProps) {
	const reducedMotion = useReducedMotion();
	const isPointerCoarse = window.matchMedia('(pointer: coarse)').matches;

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const bubblesRef = useRef<Bubble[]>([]);
	const rafIdRef = useRef<number>(0);
	const lastFrameTimeRef = useRef<number>(-1);
	const spawnAccumRef = useRef<number>(0);
	const pausedRef = useRef<boolean>(paused);

	const isDisabled = disabled || reducedMotion || isPointerCoarse;

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

		const createBubble = (): Bubble => {
			const radius = 2 + Math.random() * 6;
			return {
				x: Math.random() * canvas.width,
				y: canvas.height + radius,
				radius,
				speed: 18 + Math.random() * 32,
				wobbleAmp: 6 + Math.random() * 14,
				wobbleFreq: 0.4 + Math.random() * 0.8,
				wobblePhase: Math.random() * Math.PI * 2,
				opacity: 0.25 + Math.random() * 0.35,
			};
		};

		const drawLoop = (timestamp: number) => {
			if (pausedRef.current || !ctx) {
				lastFrameTimeRef.current = timestamp;
				rafIdRef.current = requestAnimationFrame(drawLoop);
				return;
			}

			const prevTime = lastFrameTimeRef.current;
			const isFirstFrame = prevTime < 0;
			// タブ復帰などの大ジャンプを 64ms に丸める
			const deltaMs = isFirstFrame ? 16 : Math.min(timestamp - prevTime, 64);
			lastFrameTimeRef.current = timestamp;
			const dt = deltaMs / 1000;

			// 時間ベースの湧き出し（フレームレート非依存）
			spawnAccumRef.current += deltaMs;
			while (spawnAccumRef.current >= SPAWN_INTERVAL_MS) {
				spawnAccumRef.current -= SPAWN_INTERVAL_MS;
				if (bubblesRef.current.length < MAX_BUBBLES) {
					bubblesRef.current.push(createBubble());
				}
			}

			ctx.clearRect(0, 0, canvas.width, canvas.height);

			bubblesRef.current = bubblesRef.current.filter((b) => b.y + b.radius > 0);
			for (const b of bubblesRef.current) {
				b.y -= b.speed * dt;
				b.wobblePhase += b.wobbleFreq * dt;
				const drawX = b.x + Math.sin(b.wobblePhase) * b.wobbleAmp;

				// 上端(ratio→0)に近づくとフェードアウト
				const heightRatio = b.y / canvas.height;
				const fade = heightRatio < 0.15 ? Math.max(0, heightRatio / 0.15) : 1;
				const alpha = b.opacity * fade;

				// 泡本体（淡い塗り）
				ctx.beginPath();
				ctx.arc(drawX, b.y, b.radius, 0, Math.PI * 2);
				ctx.fillStyle = `rgba(${BUBBLE_TINT}, ${alpha * 0.35})`;
				ctx.fill();

				// 縁（リム）
				ctx.lineWidth = 1;
				ctx.strokeStyle = `rgba(${BUBBLE_TINT}, ${alpha})`;
				ctx.stroke();

				// ハイライト（光の反射）
				ctx.beginPath();
				ctx.arc(
					drawX - b.radius * 0.3,
					b.y - b.radius * 0.3,
					Math.max(0.5, b.radius * 0.18),
					0,
					Math.PI * 2,
				);
				ctx.fillStyle = `rgba(220, 248, 255, ${alpha * 0.9})`;
				ctx.fill();
			}

			rafIdRef.current = requestAnimationFrame(drawLoop);
		};

		window.addEventListener('resize', handleResize);
		rafIdRef.current = requestAnimationFrame(drawLoop);

		return () => {
			window.removeEventListener('resize', handleResize);
			cancelAnimationFrame(rafIdRef.current);
			bubblesRef.current = [];
			lastFrameTimeRef.current = -1;
			spawnAccumRef.current = 0;
		};
	}, [isDisabled]);

	if (isDisabled) {
		return (
			<canvas
				ref={canvasRef}
				className="absolute inset-0 pointer-events-none hidden"
				aria-hidden="true"
				data-hidden="true"
			/>
		);
	}

	return (
		<canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" aria-hidden="true" />
	);
}

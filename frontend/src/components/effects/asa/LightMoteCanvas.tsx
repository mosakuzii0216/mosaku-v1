import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

interface Mote {
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
	phase: number; // 明滅位相
	pulseSpeed: number;
	baseOpacity: number;
}

interface LightMoteCanvasProps {
	disabled?: boolean;
	paused?: boolean;
}

// 明地(クリーム)でも視認できるよう、やや彩度の高い暖かい金
const MOTE_TINT = '233, 165, 74';
const MAX_MOTES = 22;

/**
 * 朝の光の中を、埃や花粉のような光の粒がゆっくり漂う。
 * 上下左右にゆるくドリフトし、画面端は反対側へラップ。明滅でやわらかく瞬く。
 * reduced-motion / モバイルでは無効。
 */
export function LightMoteCanvas({ disabled = false, paused = false }: LightMoteCanvasProps) {
	const reducedMotion = useReducedMotion();
	const isPointerCoarse = window.matchMedia('(pointer: coarse)').matches;

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const motesRef = useRef<Mote[]>([]);
	const rafIdRef = useRef<number>(0);
	const lastFrameTimeRef = useRef<number>(-1);
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

		const createMote = (): Mote => ({
			x: Math.random() * canvas.width,
			y: Math.random() * canvas.height,
			vx: (Math.random() - 0.5) * 14, // 横へゆるく
			vy: (Math.random() - 0.5) * 14, // 上下どちらにもゆるく＝漂う
			radius: 1.5 + Math.random() * 2.5,
			phase: Math.random() * Math.PI * 2,
			pulseSpeed: 0.6 + Math.random() * 0.9,
			baseOpacity: 0.35 + Math.random() * 0.3,
		});

		// 画面全体に散らして初期化
		motesRef.current = Array.from({ length: MAX_MOTES }, () => createMote());

		const drawLoop = (timestamp: number) => {
			if (pausedRef.current || !ctx) {
				lastFrameTimeRef.current = timestamp;
				rafIdRef.current = requestAnimationFrame(drawLoop);
				return;
			}

			const prevTime = lastFrameTimeRef.current;
			const isFirstFrame = prevTime < 0;
			const deltaMs = isFirstFrame ? 16 : Math.min(timestamp - prevTime, 64);
			lastFrameTimeRef.current = timestamp;
			const dt = deltaMs / 1000;

			ctx.clearRect(0, 0, canvas.width, canvas.height);

			for (const m of motesRef.current) {
				m.x += m.vx * dt;
				m.y += m.vy * dt;
				m.phase += m.pulseSpeed * dt;

				// 画面端は反対側へラップ(ポップインを避ける)
				const margin = m.radius * 3;
				if (m.x < -margin) m.x = canvas.width + margin;
				if (m.x > canvas.width + margin) m.x = -margin;
				if (m.y < -margin) m.y = canvas.height + margin;
				if (m.y > canvas.height + margin) m.y = -margin;

				const pulse = 0.5 + 0.5 * Math.sin(m.phase);
				const alpha = m.baseOpacity * (0.4 + 0.6 * pulse);

				// やわらかい光のにじみ
				const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.radius * 3);
				glow.addColorStop(0, `rgba(${MOTE_TINT}, ${alpha})`);
				glow.addColorStop(1, `rgba(${MOTE_TINT}, 0)`);
				ctx.fillStyle = glow;
				ctx.beginPath();
				ctx.arc(m.x, m.y, m.radius * 3, 0, Math.PI * 2);
				ctx.fill();

				// 芯
				ctx.beginPath();
				ctx.arc(m.x, m.y, m.radius * 0.6, 0, Math.PI * 2);
				ctx.fillStyle = `rgba(255, 236, 200, ${alpha})`;
				ctx.fill();
			}

			rafIdRef.current = requestAnimationFrame(drawLoop);
		};

		window.addEventListener('resize', handleResize);
		rafIdRef.current = requestAnimationFrame(drawLoop);

		return () => {
			window.removeEventListener('resize', handleResize);
			cancelAnimationFrame(rafIdRef.current);
			motesRef.current = [];
			lastFrameTimeRef.current = -1;
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

import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type ParticleColor = '#86efac' | '#22c55e' | '#fbbf24' | '#ffffff';

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
	opacity: number;
	color: ParticleColor;
	lifetime: number;
	maxLifetime: number;
}

interface ParticleCanvasProps {
	disabled?: boolean;
	paused?: boolean;
}

const PARTICLE_COLORS: ParticleColor[] = ['#86efac', '#22c55e', '#fbbf24', '#ffffff'];
const MAX_PARTICLES = 50;

export function ParticleCanvas({ disabled = false, paused = false }: ParticleCanvasProps) {
	const reducedMotion = useReducedMotion();
	const isPointerCoarse = window.matchMedia('(pointer: coarse)').matches;

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const particlesRef = useRef<Particle[]>([]);
	const rafIdRef = useRef<number>(0);
	const mouseRef = useRef<{ x: number; y: number } | null>(null);
	const lastFrameTimeRef = useRef<number>(-1);
	const slowFrameCountRef = useRef<number>(0);
	const isLightweightModeRef = useRef<boolean>(false);
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

		const createParticle = (x: number, y: number): Particle => {
			const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
			const lifetime = 40 + Math.floor(Math.random() * 40);
			return {
				x,
				y,
				vx: (Math.random() - 0.5) * 2,
				vy: -(Math.random() * 2 + 0.5),
				radius: 2 + Math.random() * 3,
				opacity: 0.8 + Math.random() * 0.2,
				color,
				lifetime,
				maxLifetime: lifetime,
			};
		};

		const handleMouseMove = (event: MouseEvent) => {
			mouseRef.current = { x: event.clientX, y: event.clientY };

			if (isLightweightModeRef.current) return;

			if (particlesRef.current.length >= MAX_PARTICLES) {
				particlesRef.current.shift();
			}
			particlesRef.current.push(createParticle(event.clientX, event.clientY));
		};

		const SLOW_FRAME_THRESHOLD = 3;

		const drawLoop = (timestamp: number) => {
			if (pausedRef.current) {
				rafIdRef.current = requestAnimationFrame(drawLoop);
				return;
			}

			if (!ctx) {
				rafIdRef.current = requestAnimationFrame(drawLoop);
				return;
			}

			const prevTime = lastFrameTimeRef.current;
			const isFirstFrame = prevTime < 0;
			const deltaTime = isFirstFrame ? 0 : timestamp - prevTime;
			lastFrameTimeRef.current = timestamp;

			if (!isFirstFrame && deltaTime > 16) {
				slowFrameCountRef.current += 1;
				if (slowFrameCountRef.current >= SLOW_FRAME_THRESHOLD) {
					isLightweightModeRef.current = true;
				}
			} else {
				slowFrameCountRef.current = 0;
				isLightweightModeRef.current = false;
			}

			ctx.clearRect(0, 0, canvas.width, canvas.height);

			particlesRef.current = particlesRef.current.filter((p) => p.lifetime > 0);
			for (const p of particlesRef.current) {
				p.x += p.vx;
				p.y += p.vy;
				p.lifetime -= 1;
				p.opacity = (p.lifetime / p.maxLifetime) * 0.9;

				ctx.beginPath();
				ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
				ctx.fillStyle = `${p.color}${Math.floor(p.opacity * 255)
					.toString(16)
					.padStart(2, '0')}`;
				ctx.fill();
			}

			rafIdRef.current = requestAnimationFrame(drawLoop);
		};

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('resize', handleResize);
		rafIdRef.current = requestAnimationFrame(drawLoop);

		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('resize', handleResize);
			cancelAnimationFrame(rafIdRef.current);
			particlesRef.current = [];
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

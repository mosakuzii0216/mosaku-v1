import { useRef } from 'react';
import { useAmbientCanvas } from '../../../hooks/useAmbientCanvas';

interface ShootingStar {
	x: number;
	y: number;
	vx: number;
	vy: number;
	len: number; // 尾の長さ(px)
	life: number; // 残り寿命(sec)
	maxLife: number;
}

interface ShootingStarCanvasProps {
	disabled?: boolean;
	paused?: boolean;
}

const STAR_TINT = '207, 224, 255'; // yoru accent #cfe0ff の RGB
const MIN_SPAWN_MS = 6000;
const MAX_SPAWN_MS = 16000;
const INITIAL_SPAWN_DELAY_MS = 2500; // 初回までの待ち(ms)

function createShootingStar(canvas: HTMLCanvasElement): ShootingStar {
	// 画面上部から斜め下へ流れる
	const fromLeft = Math.random() < 0.5;
	const speed = 620 + Math.random() * 360; // px/sec
	const angle = (Math.PI / 180) * (20 + Math.random() * 25); // 20〜45度
	const dirX = fromLeft ? Math.cos(angle) : -Math.cos(angle);
	const startX = fromLeft
		? Math.random() * canvas.width * 0.5
		: canvas.width * 0.5 + Math.random() * canvas.width * 0.5;
	const maxLife = 0.8 + Math.random() * 0.7;
	return {
		x: startX,
		y: Math.random() * canvas.height * 0.35,
		vx: dirX * speed,
		vy: Math.sin(angle) * speed,
		len: 90 + Math.random() * 90,
		life: maxLife,
		maxLife,
	};
}

/**
 * 墨夜の静寂を壊さないよう、たまに(6〜16秒に1回)流れ星がスッと流れて消える。
 * 同時に出るのは基本1つ。reduced-motion / モバイルでは無効。
 */
export function ShootingStarCanvas({ disabled = false, paused = false }: ShootingStarCanvasProps) {
	const starsRef = useRef<ShootingStar[]>([]);
	const nextSpawnRef = useRef<number>(INITIAL_SPAWN_DELAY_MS);

	const { canvasProps } = useAmbientCanvas({
		disabled,
		paused,
		onFrame: ({ ctx, canvas, deltaMs, dt }) => {
			nextSpawnRef.current -= deltaMs;
			if (nextSpawnRef.current <= 0) {
				starsRef.current.push(createShootingStar(canvas));
				nextSpawnRef.current = MIN_SPAWN_MS + Math.random() * (MAX_SPAWN_MS - MIN_SPAWN_MS);
			}

			ctx.clearRect(0, 0, canvas.width, canvas.height);

			starsRef.current = starsRef.current.filter((s) => s.life > 0);
			for (const s of starsRef.current) {
				s.x += s.vx * dt;
				s.y += s.vy * dt;
				s.life -= dt;

				const mag = Math.hypot(s.vx, s.vy) || 1;
				const tailX = s.x - (s.vx / mag) * s.len;
				const tailY = s.y - (s.vy / mag) * s.len;
				// 出現→消滅をなめらかに(中盤が最も明るい)
				const lifeRatio = Math.max(0, Math.min(1, s.life / s.maxLife));
				const alpha = Math.sin(lifeRatio * Math.PI) * 0.9;

				const grad = ctx.createLinearGradient(s.x, s.y, tailX, tailY);
				grad.addColorStop(0, `rgba(${STAR_TINT}, ${alpha})`);
				grad.addColorStop(1, `rgba(${STAR_TINT}, 0)`);
				ctx.strokeStyle = grad;
				ctx.lineWidth = 1.6;
				ctx.lineCap = 'round';
				ctx.beginPath();
				ctx.moveTo(s.x, s.y);
				ctx.lineTo(tailX, tailY);
				ctx.stroke();

				// 頭の輝き
				ctx.beginPath();
				ctx.arc(s.x, s.y, 1.6, 0, Math.PI * 2);
				ctx.fillStyle = `rgba(235, 244, 255, ${alpha})`;
				ctx.fill();
			}
		},
		onStop: () => {
			starsRef.current = [];
			nextSpawnRef.current = INITIAL_SPAWN_DELAY_MS;
		},
	});

	return <canvas {...canvasProps} />;
}

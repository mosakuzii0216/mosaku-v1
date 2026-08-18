import { useRef } from 'react';
import { useAmbientCanvas } from '../../../hooks/useAmbientCanvas';

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

function createMote(canvas: HTMLCanvasElement): Mote {
	return {
		x: Math.random() * canvas.width,
		y: Math.random() * canvas.height,
		vx: (Math.random() - 0.5) * 14, // 横へゆるく
		vy: (Math.random() - 0.5) * 14, // 上下どちらにもゆるく＝漂う
		radius: 1.5 + Math.random() * 2.5,
		phase: Math.random() * Math.PI * 2,
		pulseSpeed: 0.6 + Math.random() * 0.9,
		baseOpacity: 0.35 + Math.random() * 0.3,
	};
}

/**
 * 朝の光の中を、埃や花粉のような光の粒がゆっくり漂う。
 * 上下左右にゆるくドリフトし、画面端は反対側へラップ。明滅でやわらかく瞬く。
 * reduced-motion / モバイルでは無効。
 */
export function LightMoteCanvas({ disabled = false, paused = false }: LightMoteCanvasProps) {
	const motesRef = useRef<Mote[]>([]);

	const { canvasProps } = useAmbientCanvas({
		disabled,
		paused,
		// 画面全体に散らして初期化
		onStart: (canvas) => {
			motesRef.current = Array.from({ length: MAX_MOTES }, () => createMote(canvas));
		},
		onFrame: ({ ctx, canvas, dt }) => {
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
		},
		onStop: () => {
			motesRef.current = [];
		},
	});

	return <canvas {...canvasProps} />;
}

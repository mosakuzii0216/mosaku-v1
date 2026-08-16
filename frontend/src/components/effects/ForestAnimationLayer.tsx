import { useReducedMotion } from '../../hooks/useReducedMotion';

interface ForestAnimationLayerProps {
	disableAnimations?: boolean;
	paused?: boolean;
}

const FOG_ELEMENTS = [
	{ delay: '0s', duration: '20s', top: '10%', width: '60%', height: '120px', opacity: 0.25 },
	{ delay: '7s', duration: '25s', top: '40%', width: '80%', height: '100px', opacity: 0.2 },
	{ delay: '14s', duration: '22s', top: '70%', width: '70%', height: '140px', opacity: 0.15 },
] as const;

const LEAF_ELEMENTS = [
	{ delay: '0s', duration: '18s', left: '15%', size: '12px' },
	{ delay: '5s', duration: '22s', left: '40%', size: '10px' },
	{ delay: '10s', duration: '25s', left: '65%', size: '14px' },
	{ delay: '15s', duration: '20s', left: '85%', size: '11px' },
] as const;

export function ForestAnimationLayer({
	disableAnimations = false,
	paused = false,
}: ForestAnimationLayerProps) {
	const reducedMotion = useReducedMotion();
	const animationDisabled = disableAnimations || reducedMotion;
	const playState = paused ? 'paused' : 'running';

	return (
		<div
			className="absolute inset-0 pointer-events-none forest-animation overflow-hidden"
			aria-hidden="true"
		>
			<div
				className="absolute inset-0"
				style={{
					background: 'linear-gradient(135deg, #00552e, #1a4d2e, #47885e, #1a4d2e, #00552e)',
					backgroundSize: '400% 400%',
					animationName: animationDisabled ? 'none' : 'wave-pulse',
					animationDuration: '12s',
					animationTimingFunction: 'ease',
					animationIterationCount: 'infinite',
					animationPlayState: playState,
				}}
				data-animation="wave"
				data-disabled={animationDisabled ? 'true' : undefined}
			/>

			{FOG_ELEMENTS.map((fog, index) => (
				<div
					key={index}
					className="absolute pointer-events-none"
					style={{
						top: fog.top,
						left: 0,
						width: fog.width,
						height: fog.height,
						background: `linear-gradient(90deg, transparent, rgba(255,255,255,${fog.opacity}), transparent)`,
						borderRadius: '50%',
						filter: 'blur(20px)',
						animationName: animationDisabled ? 'none' : 'fog-drift',
						animationDuration: fog.duration,
						animationDelay: fog.delay,
						animationTimingFunction: 'ease-in-out',
						animationIterationCount: 'infinite',
						animationPlayState: playState,
					}}
					data-animation="fog"
					data-disabled={animationDisabled ? 'true' : undefined}
				/>
			))}

			{LEAF_ELEMENTS.map((leaf, index) => (
				<div
					key={index}
					className="absolute pointer-events-none"
					style={{
						top: '-5%',
						left: leaf.left,
						width: leaf.size,
						height: leaf.size,
						background: 'radial-gradient(ellipse, rgba(134,239,172,0.6), rgba(34,197,94,0.3))',
						borderRadius: '50% 0 50% 0',
						animationName: animationDisabled ? 'none' : 'leaf-float',
						animationDuration: leaf.duration,
						animationDelay: leaf.delay,
						animationTimingFunction: 'linear',
						animationIterationCount: 'infinite',
						animationPlayState: playState,
					}}
					data-animation="leaf"
					data-disabled={animationDisabled ? 'true' : undefined}
				/>
			))}
		</div>
	);
}

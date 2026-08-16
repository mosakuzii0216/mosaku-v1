import { useMoriEffectControl } from '../../../hooks/useMoriEffectControl';
import { ForestAnimationLayer } from '../ForestAnimationLayer';
import { ParticleCanvas } from '../ParticleCanvas';

export default function MoriEffectLayer() {
	const { shouldRun } = useMoriEffectControl();
	const isPointerCoarse = window.matchMedia('(pointer: coarse)').matches;
	const paused = !shouldRun;

	return (
		<div
			data-testid="mori-effect-layer"
			style={{
				position: 'fixed',
				inset: 0,
				pointerEvents: 'none',
				zIndex: 0,
			}}
			aria-hidden="true"
		>
			<ForestAnimationLayer paused={paused} />
			{!isPointerCoarse && <ParticleCanvas paused={paused} />}
		</div>
	);
}

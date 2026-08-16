// useMoriEffectControl は汎用の自動停止ロジック(reduced-motion/フォーカス/タブ非表示/3秒アイドル)。
import { useMoriEffectControl } from '../../../hooks/useMoriEffectControl';
import { ShootingStarCanvas } from './ShootingStarCanvas';

export default function YoruEffectLayer() {
	const { shouldRun } = useMoriEffectControl();

	return (
		<div
			data-testid="yoru-effect-layer"
			style={{
				position: 'fixed',
				inset: 0,
				pointerEvents: 'none',
				zIndex: 0,
			}}
			aria-hidden="true"
		>
			<ShootingStarCanvas paused={!shouldRun} />
		</div>
	);
}

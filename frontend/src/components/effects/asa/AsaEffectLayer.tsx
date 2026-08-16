// useMoriEffectControl は汎用の自動停止ロジック(reduced-motion/フォーカス/タブ非表示/3秒アイドル)。
import { useMoriEffectControl } from '../../../hooks/useMoriEffectControl';
import { LightMoteCanvas } from './LightMoteCanvas';

export default function AsaEffectLayer() {
	const { shouldRun } = useMoriEffectControl();

	return (
		<div
			data-testid="asa-effect-layer"
			style={{
				position: 'fixed',
				inset: 0,
				pointerEvents: 'none',
				zIndex: 0,
			}}
			aria-hidden="true"
		>
			<LightMoteCanvas paused={!shouldRun} />
		</div>
	);
}

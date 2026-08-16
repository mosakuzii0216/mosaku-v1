// useMoriEffectControl は名前こそ mori だが中身は汎用の自動停止ロジック
// (reduced-motion / エディタフォーカス / タブ非表示 / 3秒アイドル)。umi でも再利用する。
import { useMoriEffectControl } from '../../../hooks/useMoriEffectControl';
import { BubbleCanvas } from './BubbleCanvas';

export default function UmiEffectLayer() {
	const { shouldRun } = useMoriEffectControl();
	const paused = !shouldRun;

	return (
		<div
			data-testid="umi-effect-layer"
			style={{
				position: 'fixed',
				inset: 0,
				pointerEvents: 'none',
				zIndex: 0,
			}}
			aria-hidden="true"
		>
			<BubbleCanvas paused={paused} />
		</div>
	);
}

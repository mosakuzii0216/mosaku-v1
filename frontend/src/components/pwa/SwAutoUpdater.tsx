import { useGuardedAutoUpdate } from '../../hooks/useGuardedAutoUpdate';

/** ガード付き自動更新を駆動する headless マウント点。UI は一切描画しない。 */
export function SwAutoUpdater() {
	useGuardedAutoUpdate();
	return null;
}

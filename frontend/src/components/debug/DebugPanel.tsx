import { useEffect, useState } from 'react';

import { useSyncEngine } from '../../hooks/useSyncEngine';
import { getOfflineRepository } from '../../utils/offline/instance';
import { getSyncEngine } from '../../utils/sync/instance';
import type { DebugStats } from '../../utils/offline/repository';
import type { SyncCycleResult, SyncEvent } from '../../utils/sync/types';

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatLastResult(result: SyncCycleResult | null): string {
	if (!result) return '同期未実行';
	if (result.kind === 'completed') {
		const parts = [
			`成功 ${result.succeeded}`,
			`スキップ(LWW) ${result.skippedByLww.length}`,
			`サーバー削除 ${result.removedOnServer.length}`,
			`失敗 ${result.failed}`,
		];
		return parts.join(' / ');
	}
	if (result.kind === 'paused') {
		return `一時停止: ${result.reason} (保留 ${result.pendingCount})`;
	}
	return `中断: ${result.reason}`;
}

export function DebugPanel() {
	const { lastSyncAt } = useSyncEngine();
	const [stats, setStats] = useState<DebugStats | null>(null);
	const [lastResult, setLastResult] = useState<SyncCycleResult | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const reload = () => {
			const handle = getOfflineRepository();
			handle.repository
				.statsForDebug()
				.then((next) => {
					if (cancelled) return;
					setStats(next);
				})
				.catch((err: unknown) => {
					if (cancelled) return;
					setLoadError(err instanceof Error ? err.message : String(err));
				});
		};

		reload();

		const engine = getSyncEngine();
		const unsubscribe = engine.subscribe((event: SyncEvent) => {
			if (event.type === 'cycle-complete') {
				setLastResult(event.result);
				reload();
			}
			if (event.type === 'pending-changed') {
				reload();
			}
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, []);

	return (
		<section
			data-testid="debug-panel"
			className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 max-w-2xl"
		>
			<header>
				<h2 className="text-lg font-semibold text-gray-800">オフラインデバッグ情報</h2>
				<p className="text-xs text-gray-500 mt-1">
					開発者向け表示 — オフラインキャッシュと同期状況の確認に使います。
				</p>
			</header>

			{loadError && (
				<div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
					情報取得エラー: {loadError}
				</div>
			)}

			<dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
				<dt className="text-gray-500">キャッシュ済みメモ件数</dt>
				<dd data-testid="debug-cached-count" className="font-mono">
					{stats?.cachedCount ?? '—'}
				</dd>

				<dt className="text-gray-500">保留キュー件数</dt>
				<dd data-testid="debug-pending-count" className="font-mono">
					{stats?.pendingCount ?? '—'}
				</dd>

				<dt className="text-gray-500">最終同期日時</dt>
				<dd data-testid="debug-last-sync-at" className="font-mono">
					{lastSyncAt ?? '未同期'}
				</dd>

				<dt className="text-gray-500">最終同期結果</dt>
				<dd data-testid="debug-last-result" className="font-mono text-xs">
					{formatLastResult(lastResult)}
				</dd>

				{stats?.quotaSnapshot && (
					<>
						<dt className="text-gray-500">ストレージ使用量</dt>
						<dd data-testid="debug-quota-usage" className="font-mono">
							{formatBytes(stats.quotaSnapshot.usageBytes)} /{' '}
							{formatBytes(stats.quotaSnapshot.quotaBytes)}
							{stats.quotaSnapshot.thresholdReached && (
								<span className="ml-2 text-amber-600">(80% 超過)</span>
							)}
						</dd>

						<dt className="text-gray-500">最大エントリ数</dt>
						<dd data-testid="debug-max-entries" className="font-mono">
							{stats.quotaSnapshot.maxEntries}
						</dd>
					</>
				)}
			</dl>

			<footer className="text-xs text-gray-500 pt-2 border-t border-gray-100">
				検索でローカル件数 0 のときは「オフラインキャッシュ範囲のみ検索しました」と表示されます。
			</footer>
		</section>
	);
}

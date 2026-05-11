import { useEffect, useState } from 'react';

import { getSyncEngine } from '../../utils/sync/instance';
import type { RemovedOnServerEntry, SkippedByLwwEntry, SyncEvent } from '../../utils/sync/types';

type ToastKind = 'success' | 'skipped' | 'removed' | 'failed' | 'auth' | 'cache-rebuilt';

interface ToastItem {
	id: number;
	kind: ToastKind;
	message: string;
	titles?: string[];
	count?: number;
}

export interface SyncToastProps {
	autoDismissMs?: number;
}

const DEFAULT_DISMISS_MS = 6000;

const TONE_CLASSES: Record<ToastKind, string> = {
	success: 'bg-green-50 border-green-300 text-green-800',
	skipped: 'bg-amber-50 border-amber-300 text-amber-800',
	removed: 'bg-orange-50 border-orange-300 text-orange-800',
	failed: 'bg-red-50 border-red-300 text-red-800',
	auth: 'bg-red-50 border-red-300 text-red-800',
	'cache-rebuilt': 'bg-blue-50 border-blue-300 text-blue-800',
};

function buildToastsFromEvent(event: SyncEvent, seed: number): ToastItem[] {
	if (event.type === 'cycle-complete' && event.result.kind === 'completed') {
		const items: ToastItem[] = [];
		const { succeeded, skippedByLww, removedOnServer, failed } = event.result;
		if (succeeded > 0) {
			items.push({
				id: seed + items.length,
				kind: 'success',
				message: `${succeeded} 件のメモを同期しました`,
				count: succeeded,
			});
		}
		if (skippedByLww.length > 0) {
			items.push({
				id: seed + items.length,
				kind: 'skipped',
				message: `他デバイスで更新されたためスキップ: ${formatTitles(skippedByLww)}`,
				titles: skippedByLww.map((s) => s.title),
			});
		}
		if (removedOnServer.length > 0) {
			items.push({
				id: seed + items.length,
				kind: 'removed',
				message: `サーバー側で削除されています: ${formatTitles(removedOnServer)}`,
				titles: removedOnServer.map((s) => s.title),
			});
		}
		if (failed > 0) {
			items.push({
				id: seed + items.length,
				kind: 'failed',
				message: `${failed} 件の同期に失敗しました（再試行が続行されます）`,
				count: failed,
			});
		}
		return items;
	}
	if (event.type === 'auth-required') {
		return [
			{
				id: seed,
				kind: 'auth',
				message: '認証期限が切れました。再ログインしてください。',
			},
		];
	}
	return [];
}

function formatTitles(entries: ReadonlyArray<SkippedByLwwEntry | RemovedOnServerEntry>): string {
	return entries
		.map((e) => e.title || '(無題)')
		.slice(0, 3)
		.concat(entries.length > 3 ? [`他 ${entries.length - 3} 件`] : [])
		.join('、');
}

export function SyncToast({ autoDismissMs = DEFAULT_DISMISS_MS }: SyncToastProps = {}) {
	const [items, setItems] = useState<ToastItem[]>([]);

	useEffect(() => {
		const engine = getSyncEngine();
		let counter = 0;
		const unsubscribe = engine.subscribe((event: SyncEvent) => {
			const fresh = buildToastsFromEvent(event, counter);
			if (fresh.length === 0) return;
			counter += fresh.length;
			setItems((prev) => [...prev, ...fresh]);
		});
		return unsubscribe;
	}, []);

	useEffect(() => {
		if (items.length === 0) return;
		const timers = items.map((item) =>
			setTimeout(() => {
				setItems((prev) => prev.filter((i) => i.id !== item.id));
			}, autoDismissMs),
		);
		return () => {
			for (const t of timers) clearTimeout(t);
		};
	}, [items, autoDismissMs]);

	if (items.length === 0) return null;

	return (
		<div
			data-testid="sync-toast-region"
			aria-live="polite"
			className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
		>
			{items.map((item) => (
				<div
					key={item.id}
					data-testid={`sync-toast-${item.kind}`}
					className={`border rounded-lg shadow-md px-4 py-3 text-sm ${TONE_CLASSES[item.kind]}`}
				>
					{item.message}
				</div>
			))}
		</div>
	);
}

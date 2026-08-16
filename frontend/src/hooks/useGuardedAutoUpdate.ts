import { useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import { logger } from '../utils/logger';
import { useSwRegistration } from './useSwRegistration';
import { useSaveStatusStore, selectHasUnsavedWork } from '../stores/useSaveStatusStore';
import { useEditorFocusStore } from '../stores/useEditorFocusStore';

/** applyUpdate() 呼出後、この時間内にリロードがなければ不発と判定する（ms） */
export const MISFIRE_TIMEOUT_MS = 10_000;

/** updateAvailable=true のまま guard がブロックし続けた場合に保留を記録するまでの時間（ms） */
export const BOUNDED_ESCAPE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * 安全な場合のみ SW 更新を適用する headless オーケストレータ。
 * - 未保存/進行中/失敗（hasUnsavedWork）またはエディタフォーカス中は保留
 * - 条件解消時に applyUpdate() を 1 サイクル 1 回だけ起動（one-shot）
 * - 不発・保留継続を Sentry breadcrumb で観測可能にする（Req 6.5）
 */
export function useGuardedAutoUpdate(): void {
	const { updateAvailable, applyUpdate } = useSwRegistration();
	const hasUnsavedWork = useSaveStatusStore(selectHasUnsavedWork);
	const isEditorFocused = useEditorFocusStore((s) => s.isEditorFocused);

	// one-shot guard: 1 更新サイクルにつき 1 回のみ applyUpdate を起動する
	const appliedRef = useRef(false);
	// 再武装のために直前の updateAvailable を追跡する
	const prevUpdateAvailableRef = useRef(false);
	const misfireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const boundedEscapeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// 不発後の再試行トリガー（ref だけでは effect が再評価されないため state で通知）
	const [retrySignal, setRetrySignal] = useState(0);

	const canReload = !hasUnsavedWork && !isEditorFocused;

	useEffect(() => {
		// 再武装: updateAvailable が false→true に遷移し、かつ前サイクルで適用済みなら reset
		if (updateAvailable && !prevUpdateAvailableRef.current && appliedRef.current) {
			appliedRef.current = false;
		}
		prevUpdateAvailableRef.current = updateAvailable;

		if (!updateAvailable) {
			if (misfireTimerRef.current) {
				clearTimeout(misfireTimerRef.current);
				misfireTimerRef.current = null;
			}
			if (boundedEscapeTimerRef.current) {
				clearTimeout(boundedEscapeTimerRef.current);
				boundedEscapeTimerRef.current = null;
			}
			return;
		}

		if (appliedRef.current) return;

		if (canReload) {
			// guard pass: bounded escape タイマーをキャンセルしてリロード起動
			if (boundedEscapeTimerRef.current) {
				clearTimeout(boundedEscapeTimerRef.current);
				boundedEscapeTimerRef.current = null;
			}

			appliedRef.current = true;

			Sentry.addBreadcrumb({
				category: 'pwa',
				message: 'sw_auto_reload_triggered',
				level: 'info',
				data: { feature_area: 'system' },
			});

			// 不発検知タイマー: MISFIRE_TIMEOUT_MS 以内にリロードがなければ breadcrumb を残し再試行
			misfireTimerRef.current = setTimeout(() => {
				misfireTimerRef.current = null;
				Sentry.addBreadcrumb({
					category: 'pwa',
					message: 'sw_auto_reload_misfire',
					level: 'warning',
					data: { feature_area: 'system' },
				});
				appliedRef.current = false;
				setRetrySignal((n) => n + 1);
			}, MISFIRE_TIMEOUT_MS);

			applyUpdate().catch((err: unknown) => {
				logger.error('[pwa] applyUpdate failed', err);
				appliedRef.current = false;
				if (misfireTimerRef.current) {
					clearTimeout(misfireTimerRef.current);
					misfireTimerRef.current = null;
				}
			});
		} else {
			// guard blocked: bounded escape タイマーが未設定なら開始
			if (!boundedEscapeTimerRef.current) {
				boundedEscapeTimerRef.current = setTimeout(() => {
					boundedEscapeTimerRef.current = null;
					Sentry.addBreadcrumb({
						category: 'pwa',
						message: 'sw_auto_reload_held',
						level: 'warning',
						data: { feature_area: 'system' },
					});
				}, BOUNDED_ESCAPE_TIMEOUT_MS);
			}
		}
	}, [updateAvailable, canReload, applyUpdate, retrySignal]);

	// アンマウント時にタイマーを確実に解除する
	useEffect(() => {
		return () => {
			if (misfireTimerRef.current) clearTimeout(misfireTimerRef.current);
			if (boundedEscapeTimerRef.current) clearTimeout(boundedEscapeTimerRef.current);
		};
	}, []);
}

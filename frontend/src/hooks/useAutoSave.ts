import { useState, useRef, useCallback, useEffect } from 'react';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface UseAutoSaveOptions {
	/** hasChanges && (title または content が非空) */
	canSave: boolean;
	/** createMemo.isPending || updateMemo.isPending */
	isSaving: boolean;
	/** 保存処理本体。resolve で成功、reject で失敗 */
	onSave: () => Promise<void>;
	/** デバウンス待機時間（ms）。デフォルト 2000 */
	debounceMs?: number;
}

export interface UseAutoSaveReturn {
	saveStatus: SaveStatus;
	/** フィールド変更のたびに呼び出す。タイマーをリセットし pending に遷移 */
	scheduleAutoSave: () => void;
	/** 手動保存前に呼び出す。実行中のタイマーをキャンセル */
	cancelDebounce: () => void;
}

const SAVED_RESET_DELAY_MS = 2000;

export function useAutoSave({
	canSave,
	isSaving,
	onSave,
	debounceMs = 2000,
}: UseAutoSaveOptions): UseAutoSaveReturn {
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const savedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// タイマーコールバック内で最新値を参照するための refs
	// レンダリング中に同期更新（useEffect の非同期更新では stale closure が生じる）
	const canSaveRef = useRef(canSave);
	canSaveRef.current = canSave;

	const isSavingRef = useRef(isSaving);
	isSavingRef.current = isSaving;

	const onSaveRef = useRef(onSave);
	onSaveRef.current = onSave;

	const clearSavedResetTimer = useCallback(() => {
		if (savedResetTimerRef.current !== null) {
			clearTimeout(savedResetTimerRef.current);
			savedResetTimerRef.current = null;
		}
	}, []);

	const cancelDebounce = useCallback(() => {
		if (debounceTimerRef.current !== null) {
			clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = null;
		}
	}, []);

	const scheduleAutoSave = useCallback(() => {
		// 既存のタイマーをリセット
		if (debounceTimerRef.current !== null) {
			clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = null;
		}

		// onChange は React の再レンダリング前に呼ばれるため canSaveRef はこの時点で古い値を持つ。
		// ガードはタイマー発火時に一元化し、呼び出し側は常に pending に遷移させる。
		setSaveStatus('pending');

		debounceTimerRef.current = setTimeout(async () => {
			debounceTimerRef.current = null;

			// タイマー発火時に再評価（Requirements: 4.1, 4.2, 4.3）
			if (!canSaveRef.current || isSavingRef.current) {
				setSaveStatus('idle');
				return;
			}

			setSaveStatus('saving');

			try {
				await onSaveRef.current();
				setSaveStatus('saved');

				// saved → idle へ自動リセット（Requirements: 1.2）
				clearSavedResetTimer();
				savedResetTimerRef.current = setTimeout(() => {
					setSaveStatus('idle');
					savedResetTimerRef.current = null;
				}, SAVED_RESET_DELAY_MS);
			} catch {
				setSaveStatus('error');
			}
		}, debounceMs);
	}, [clearSavedResetTimer, debounceMs]);

	// アンマウント時のクリーンアップ（Requirements: 4.4）
	useEffect(() => {
		return () => {
			cancelDebounce();
			clearSavedResetTimer();
		};
	}, [cancelDebounce, clearSavedResetTimer]);

	return { saveStatus, scheduleAutoSave, cancelDebounce };
}

import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SaveStatus } from './useAutoSave';

/**
 * 「N分前に保存」の表示を更新するための再描画間隔（ミリ秒）。
 * 保存時刻は経過時間で表示するため、値が変わらなくても定期的に描き直す必要がある。
 */
export const SAVED_AT_TICK_INTERVAL_MS = 30 * 1000;

/**
 * 最後に保存が成功した時刻を保持し、相対表示を一定間隔で描き直す。
 *
 * 編集対象の切り替えなど、保存以外の理由で時刻を差し替える経路があるため
 * useState と同じ [値, setter] の形で返す。
 *
 * @param saveStatus 自動保存の状態。'saved' に変わった時点を保存時刻とみなす
 * @param initialSavedAt 初期表示に使う保存時刻（永続化済みの updatedAt など）
 */
export const useLastSavedAt = (
	saveStatus: SaveStatus,
	initialSavedAt: Date | null = null,
): [Date | null, Dispatch<SetStateAction<Date | null>>] => {
	const [lastSavedAt, setLastSavedAt] = useState<Date | null>(initialSavedAt);
	const [, setTick] = useState(0);

	useEffect(() => {
		if (saveStatus === 'saved') {
			setLastSavedAt(new Date());
		}
	}, [saveStatus]);

	useEffect(() => {
		if (!lastSavedAt) return;
		const id = setInterval(() => setTick((n) => n + 1), SAVED_AT_TICK_INTERVAL_MS);
		return () => clearInterval(id);
	}, [lastSavedAt]);

	return [lastSavedAt, setLastSavedAt];
};

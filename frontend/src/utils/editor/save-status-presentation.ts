import type { SaveStatus } from '../../hooks/useAutoSave';

export type SaveStatusTone = 'idle' | 'progress' | 'success' | 'warn' | 'error';

export interface SaveStatusDescription {
	label: string | null;
	tone: SaveStatusTone;
}

export const exhaustiveSaveStatusKeys: ReadonlyArray<SaveStatus> = [
	'idle',
	'pending',
	'saving',
	'saved',
	'error',
	'offline-saved',
];

export function describeSaveStatus(status: SaveStatus): SaveStatusDescription {
	switch (status) {
		case 'idle':
			return { label: null, tone: 'idle' };
		case 'pending':
			return { label: '未保存', tone: 'idle' };
		case 'saving':
			return { label: '保存中...', tone: 'progress' };
		case 'saved':
			return { label: '保存済み', tone: 'success' };
		case 'offline-saved':
			return {
				label: 'オフライン保存済み — 再接続後に同期されます',
				tone: 'warn',
			};
		case 'error':
			return { label: '保存失敗 — 手動保存してください', tone: 'error' };
		default: {
			const exhaustiveCheck: never = status;
			throw new Error(`Unhandled SaveStatus: ${String(exhaustiveCheck)}`);
		}
	}
}

export function formatRelativeTime(now: Date, target: Date): string {
	const diffSec = Math.max(0, Math.floor((now.getTime() - target.getTime()) / 1000));
	if (diffSec < 5) return '今しがた';
	if (diffSec < 60) return `${diffSec}秒前`;
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin}分前`;
	const diffHour = Math.floor(diffMin / 60);
	if (diffHour < 24) return `${diffHour}時間前`;
	const diffDay = Math.floor(diffHour / 24);
	if (diffDay < 30) return `${diffDay}日前`;
	return target.toLocaleDateString('ja-JP');
}

export const SAVE_STATUS_TONE_CLASSES: Record<SaveStatusTone, string> = {
	idle: 'text-gray-400',
	progress: 'text-blue-400',
	success: 'text-green-500',
	warn: 'text-amber-600',
	error: 'text-red-500',
};

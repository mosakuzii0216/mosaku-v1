import type { SaveStatus } from '../../hooks/useAutoSave';
import type { NetworkStatus } from '../../stores/useNetworkStatusStore';

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

export interface DeleteConfirmInput {
	kind: 'trash' | 'permanentDelete';
	networkStatus: NetworkStatus;
}

export function describeDeleteConfirm({ kind, networkStatus }: DeleteConfirmInput): string {
	const isOffline = networkStatus !== 'online';
	if (kind === 'trash') {
		if (isOffline) {
			return 'このメモをゴミ箱に移動します。再接続後に同期されます。';
		}
		return 'このメモをゴミ箱に移動しますか？';
	}
	// permanentDelete
	if (isOffline) {
		return 'このメモを完全に削除します。再接続後に同期されます。';
	}
	return 'このメモを完全に削除しますか？この操作は取り消せません。';
}

import type { NetworkStatus } from '../../stores/useNetworkStatusStore';

export type { SaveStatusTone, SaveStatusDescription } from '../editor/save-status-presentation';
export {
	exhaustiveSaveStatusKeys,
	describeSaveStatus,
	formatRelativeTime,
} from '../editor/save-status-presentation';

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

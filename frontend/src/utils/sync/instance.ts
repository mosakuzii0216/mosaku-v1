import { apiClient } from '../api';
import { getOfflineRepository } from '../offline/instance';
import { useNetworkStatusStore } from '../../stores/useNetworkStatusStore';

import { createSyncEngine, type SyncEngine } from './sync-engine';
import { createSyncTelemetry } from './sync-telemetry';
import { MemoSyncApiError, type MemoSyncApi, type MemoSyncUpdatePayload } from './types';

let engine: SyncEngine | null = null;

function toSyncApiError(err: unknown): never {
	if (err instanceof MemoSyncApiError) throw err;
	const message = err instanceof Error ? err.message : String(err);
	const match = /status:\s*(\d{3})/.exec(message);
	if (match) {
		throw new MemoSyncApiError(Number(match[1]), message);
	}
	throw err instanceof Error ? err : new Error(message);
}

const memoSyncApi: MemoSyncApi = {
	async updateMemo(id, data: MemoSyncUpdatePayload) {
		try {
			const memo = await apiClient.updateMemo(id, data);
			return {
				id: memo.id,
				title: memo.title,
				content: memo.content,
				tagIds: memo.memoTags?.map((mt) => mt.tag.id) ?? [],
				notebookId: memo.notebookId ?? null,
				createdAt: memo.createdAt,
				updatedAt: memo.updatedAt,
				trashedAt: memo.trashedAt,
			};
		} catch (err) {
			toSyncApiError(err);
		}
	},
	async trashMemo(id) {
		try {
			const memo = await apiClient.deleteMemo(id);
			return {
				id: memo.id,
				title: memo.title,
				content: memo.content,
				tagIds: memo.memoTags?.map((mt) => mt.tag.id) ?? [],
				notebookId: memo.notebookId ?? null,
				createdAt: memo.createdAt,
				updatedAt: memo.updatedAt,
				trashedAt: memo.trashedAt,
			};
		} catch (err) {
			toSyncApiError(err);
		}
	},
	async permanentDeleteMemo(id) {
		try {
			const memo = await apiClient.permanentDeleteMemo(id);
			return {
				id: memo.id,
				title: memo.title,
				content: memo.content,
				tagIds: memo.memoTags?.map((mt) => mt.tag.id) ?? [],
				notebookId: memo.notebookId ?? null,
				createdAt: memo.createdAt,
				updatedAt: memo.updatedAt,
				trashedAt: memo.trashedAt,
			};
		} catch (err) {
			toSyncApiError(err);
		}
	},
	async getMemos() {
		try {
			const memos = await apiClient.getMemos();
			return memos.map((memo) => ({
				id: memo.id,
				title: memo.title,
				content: memo.content,
				tagIds: memo.memoTags?.map((mt) => mt.tag.id) ?? [],
				notebookId: memo.notebookId ?? null,
				createdAt: memo.createdAt,
				updatedAt: memo.updatedAt,
				trashedAt: memo.trashedAt,
			}));
		} catch (err) {
			toSyncApiError(err);
		}
	},
};

export function getSyncEngine(): SyncEngine {
	if (engine) return engine;
	const { repository } = getOfflineRepository();
	engine = createSyncEngine({
		repository,
		api: memoSyncApi,
		isOnline: () => useNetworkStatusStore.getState().status === 'online',
		telemetry: createSyncTelemetry(),
	});
	return engine;
}

export function resetSyncEngineForTest(): void {
	if (engine && engine.isRunning()) engine.stop();
	engine = null;
}

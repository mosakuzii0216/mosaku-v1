import type { JSONContent } from '@tiptap/react';

import type { ServerMemoSnapshot } from '../offline/repository';

export type SkippedByLwwEntry = { memoId: string; title: string };
export type RemovedOnServerEntry = { memoId: string; title: string };

export type SyncCycleResult =
	| {
			kind: 'completed';
			succeeded: number;
			skippedByLww: ReadonlyArray<SkippedByLwwEntry>;
			removedOnServer: ReadonlyArray<RemovedOnServerEntry>;
			failed: number;
	  }
	| { kind: 'paused'; reason: 'auth' | 'unstable-network'; pendingCount: number }
	| { kind: 'aborted'; reason: 'leader-lost' | 'not-leader' | 'no-network' | 'retry-exhausted' };

export type SyncEvent =
	| { type: 'cycle-start' }
	| { type: 'cycle-complete'; result: SyncCycleResult }
	| { type: 'pending-changed'; count: number }
	| { type: 'auth-required' };

export interface MemoSyncUpdatePayload {
	title?: string;
	content?: JSONContent;
	notebookId?: string | null;
	clientUpdatedAt: string;
}

export interface MemoSyncApi {
	updateMemo(id: string, data: MemoSyncUpdatePayload): Promise<ServerMemoSnapshot>;
	trashMemo(id: string): Promise<ServerMemoSnapshot>;
	permanentDeleteMemo(id: string): Promise<ServerMemoSnapshot>;
	getMemos(): Promise<ServerMemoSnapshot[]>;
}

export class MemoSyncApiError extends Error {
	readonly status: number;
	readonly body: unknown;

	constructor(status: number, message: string, body?: unknown) {
		super(message);
		this.name = 'MemoSyncApiError';
		this.status = status;
		this.body = body;
	}
}

export function isMemoSyncApiError(value: unknown): value is MemoSyncApiError {
	return value instanceof MemoSyncApiError;
}

export interface SyncTelemetry {
	breadcrumb(
		stage: 'cycle-start' | 'success' | 'skipped-by-lww' | 'removed-on-server' | 'failed',
		payload: { memoId?: string; statusCode?: number; attempt?: number },
	): void;
	reportRetryExhausted(payload: { memoId: string; attempt: number; statusCode?: number }): void;
}

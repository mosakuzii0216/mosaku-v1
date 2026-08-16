import type { PendingOperationRecord } from '../offline/db';
import type { OfflineMemoRepository, ServerMemoSnapshot } from '../offline/repository';

import { createLeaderElection, type LeaderElection } from './leader-election';
import {
	isMemoSyncApiError,
	type MemoSyncApi,
	type RemovedOnServerEntry,
	type SkippedByLwwEntry,
	type SyncCycleResult,
	type SyncEvent,
	type SyncTelemetry,
} from './types';

export interface SyncEngineOptions {
	repository: OfflineMemoRepository;
	api: MemoSyncApi;
	isOnline?: () => boolean;
	leaderElection?: LeaderElection;
	telemetry?: SyncTelemetry;
	initialBackoffMs?: number;
	maxBackoffMs?: number;
	maxRetries?: number;
	sleep?: (ms: number) => Promise<void>;
}

export interface SyncEngine {
	start(): Promise<void>;
	stop(): void;
	isRunning(): boolean;
	isLeader(): boolean;
	getPendingCount(): number;
	getLastSyncAt(): string | null;
	subscribe(listener: (event: SyncEvent) => void): () => void;
	triggerDrainNow(): Promise<SyncCycleResult>;
	notifyEnqueueChanged(): Promise<void>;
	waitForIdle(): Promise<void>;
}

type OperationResult =
	| { kind: 'success' }
	| { kind: 'lww-skipped'; serverTitle: string }
	| { kind: 'removed'; title: string }
	| { kind: 'failed' }
	| { kind: 'auth-paused' };

const DEFAULT_INITIAL_BACKOFF_MS = 2_000;
const DEFAULT_MAX_BACKOFF_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_RETRIES = 3;

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
	const {
		repository,
		api,
		isOnline = () => true,
		leaderElection = createLeaderElection(),
		telemetry,
		initialBackoffMs = DEFAULT_INITIAL_BACKOFF_MS,
		maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
		maxRetries = DEFAULT_MAX_RETRIES,
		sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
	} = options;

	let started = false;
	let pendingCount = 0;
	let lastSyncAt: string | null = null;
	const listeners = new Set<(event: SyncEvent) => void>();

	let inFlightCycle: Promise<SyncCycleResult> | null = null;
	let rerunRequested = false;
	let pendingRerun: Promise<void> | null = null;

	const emit = (event: SyncEvent) => {
		for (const l of [...listeners]) l(event);
	};

	const refreshPendingCount = async () => {
		const count = (await repository.listPending()).length;
		if (count !== pendingCount) {
			pendingCount = count;
			emit({ type: 'pending-changed', count });
		}
	};

	const invokeApi = (op: PendingOperationRecord): Promise<ServerMemoSnapshot> => {
		if (op.kind === 'update') {
			return api.updateMemo(op.memoId, {
				...(op.patch ?? {}),
				clientUpdatedAt: op.clientUpdatedAt,
			});
		}
		if (op.kind === 'trash') {
			return api.trashMemo(op.memoId);
		}
		return api.permanentDeleteMemo(op.memoId);
	};

	const incrementRetry = async (op: PendingOperationRecord, attempt: number) => {
		await repository.enqueueOperation({ ...op, retryCount: attempt });
	};

	const handleApiError = async (
		op: PendingOperationRecord,
		err: unknown,
		attempt: number,
	): Promise<{ next: 'retry' | 'stop'; result?: OperationResult; backoffMs?: number }> => {
		if (isMemoSyncApiError(err)) {
			if (err.status === 409) {
				const current = extractCurrentMemo(err.body);
				if (current) await repository.markSynced(current);
				await repository.removePending(op.memoId, op.kind);
				telemetry?.breadcrumb('skipped-by-lww', {
					memoId: op.memoId,
					statusCode: 409,
					attempt,
				});
				return { next: 'stop', result: { kind: 'lww-skipped', serverTitle: current?.title ?? '' } };
			}
			if (err.status === 404) {
				const cached = await repository.getMemo(op.memoId);
				const title = cached?.title ?? '';
				await repository.evictById(op.memoId);
				await repository.removePending(op.memoId, op.kind);
				telemetry?.breadcrumb('removed-on-server', {
					memoId: op.memoId,
					statusCode: 404,
					attempt,
				});
				return { next: 'stop', result: { kind: 'removed', title } };
			}
			if (err.status === 401 || err.status === 403) {
				telemetry?.breadcrumb('failed', {
					memoId: op.memoId,
					statusCode: err.status,
					attempt,
				});
				return { next: 'stop', result: { kind: 'auth-paused' } };
			}
			if (err.status >= 500) {
				telemetry?.breadcrumb('failed', {
					memoId: op.memoId,
					statusCode: err.status,
					attempt,
				});
				if (attempt >= maxRetries) {
					telemetry?.reportRetryExhausted({
						memoId: op.memoId,
						attempt,
						statusCode: err.status,
					});
					await incrementRetry(op, attempt);
					return { next: 'stop', result: { kind: 'failed' } };
				}
				return { next: 'retry' };
			}
			// その他の 4xx — 取り除いて failed 扱い
			telemetry?.breadcrumb('failed', { memoId: op.memoId, statusCode: err.status, attempt });
			await repository.removePending(op.memoId, op.kind);
			return { next: 'stop', result: { kind: 'failed' } };
		}
		// ネットワーク不通など、status のないエラー → リトライ
		telemetry?.breadcrumb('failed', { memoId: op.memoId, attempt });
		if (attempt >= maxRetries) {
			telemetry?.reportRetryExhausted({ memoId: op.memoId, attempt });
			await incrementRetry(op, attempt);
			return { next: 'stop', result: { kind: 'failed' } };
		}
		return { next: 'retry' };
	};

	const processOperation = async (op: PendingOperationRecord): Promise<OperationResult> => {
		let attempt = 0;
		let backoffMs = initialBackoffMs;
		while (attempt < maxRetries) {
			attempt += 1;
			try {
				const response = await invokeApi(op);
				await repository.markSynced(response);
				await repository.removePending(op.memoId, op.kind);
				telemetry?.breadcrumb('success', { memoId: op.memoId, statusCode: 200, attempt });
				return { kind: 'success' };
			} catch (err) {
				const decision = await handleApiError(op, err, attempt);
				if (decision.next === 'stop') {
					return decision.result ?? { kind: 'failed' };
				}
				// retry
				await sleep(Math.min(backoffMs, maxBackoffMs));
				backoffMs *= 2;
				if (!isOnline()) {
					await incrementRetry(op, attempt);
					return { kind: 'failed' };
				}
			}
		}
		return { kind: 'failed' };
	};

	const runCycle = async (): Promise<SyncCycleResult> => {
		emit({ type: 'cycle-start' });
		telemetry?.breadcrumb('cycle-start', {});

		let succeeded = 0;
		let failed = 0;
		const skippedByLww: SkippedByLwwEntry[] = [];
		const removedOnServer: RemovedOnServerEntry[] = [];
		let pausedByAuth = false;

		const initialPending = await repository.listPending();

		for (const op of initialPending) {
			if (!isOnline()) break;
			const r = await processOperation(op);
			if (r.kind === 'success') succeeded += 1;
			else if (r.kind === 'lww-skipped') {
				skippedByLww.push({ memoId: op.memoId, title: r.serverTitle });
			} else if (r.kind === 'removed') {
				removedOnServer.push({ memoId: op.memoId, title: r.title });
			} else if (r.kind === 'failed') {
				failed += 1;
			} else if (r.kind === 'auth-paused') {
				pausedByAuth = true;
				break;
			}
		}

		if (pausedByAuth) {
			emit({ type: 'auth-required' });
			await refreshPendingCount();
			const result: SyncCycleResult = {
				kind: 'paused',
				reason: 'auth',
				pendingCount,
			};
			emit({ type: 'cycle-complete', result });
			return result;
		}

		try {
			const latest = await api.getMemos();
			await repository.upsertFromServer(latest);
		} catch {
			// 最終再取得の失敗はサイクル全体の成否に影響させない（次回サイクルで取り直す）
		}

		lastSyncAt = new Date().toISOString();
		await refreshPendingCount();

		const result: SyncCycleResult = {
			kind: 'completed',
			succeeded,
			skippedByLww,
			removedOnServer,
			failed,
		};
		emit({ type: 'cycle-complete', result });
		return result;
	};

	const triggerDrainNow = async (): Promise<SyncCycleResult> => {
		if (!leaderElection.isLeader()) {
			return { kind: 'aborted', reason: 'not-leader' };
		}
		if (!isOnline()) {
			return { kind: 'aborted', reason: 'no-network' };
		}
		if (inFlightCycle) {
			// 同時呼び出しは現行サイクルを共有（ミューテックス）
			return inFlightCycle;
		}
		const cycle = runCycle().finally(() => {
			inFlightCycle = null;
			if (rerunRequested && started) {
				rerunRequested = false;
				pendingRerun = (async () => {
					try {
						await triggerDrainNow();
					} finally {
						pendingRerun = null;
					}
				})();
			} else {
				rerunRequested = false;
			}
		});
		inFlightCycle = cycle;
		return cycle;
	};

	return {
		async start() {
			if (started) return;
			started = true;
			await leaderElection.start();
			await refreshPendingCount();
		},
		stop() {
			if (!started) return;
			started = false;
			leaderElection.stop();
		},
		isRunning() {
			return started;
		},
		isLeader() {
			return leaderElection.isLeader();
		},
		getPendingCount() {
			return pendingCount;
		},
		getLastSyncAt() {
			return lastSyncAt;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		triggerDrainNow,
		async notifyEnqueueChanged() {
			if (inFlightCycle) {
				rerunRequested = true;
			}
			await refreshPendingCount();
		},
		async waitForIdle() {
			while (inFlightCycle || pendingRerun) {
				if (inFlightCycle) {
					try {
						await inFlightCycle;
					} catch {
						// nothing
					}
				}
				if (pendingRerun) {
					const p = pendingRerun;
					try {
						await p;
					} catch {
						// nothing
					}
					if (pendingRerun === p) pendingRerun = null;
				}
			}
		},
	};
}

function extractCurrentMemo(body: unknown): ServerMemoSnapshot | null {
	if (typeof body !== 'object' || body === null) return null;
	const candidate = (body as { current?: unknown }).current;
	if (typeof candidate !== 'object' || candidate === null) return null;
	const c = candidate as Partial<ServerMemoSnapshot>;
	if (typeof c.id !== 'string') return null;
	return c as ServerMemoSnapshot;
}

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';

import {
	OFFLINE_DB_NAME,
	openOfflineDb,
	type OfflineDB,
	type PendingOperationRecord,
	type SyncOperationKind,
} from '../offline/db';
import { OfflineMemoRepository, type ServerMemoSnapshot } from '../offline/repository';

import { createSyncEngine, type SyncEngine, type SyncEngineOptions } from './sync-engine';
import {
	MemoSyncApiError,
	type MemoSyncApi,
	type MemoSyncUpdatePayload,
	type SyncEvent,
	type SyncTelemetry,
} from './types';
import type { LeaderElection } from './leader-election';

const USER_ID = 'user-1';

async function setupRepo(): Promise<{ repo: OfflineMemoRepository; db: OfflineDB }> {
	const { db } = await openOfflineDb();
	const repo = new OfflineMemoRepository({
		db,
		getCurrentUserId: () => USER_ID,
	});
	return { repo, db };
}

function createSnapshot(overrides: Partial<ServerMemoSnapshot> = {}): ServerMemoSnapshot {
	return {
		id: 'memo-1',
		title: 'Memo 1',
		content: '<p>hello</p>',
		tagIds: [],
		notebookId: null,
		createdAt: '2026-05-01T00:00:00.000Z',
		updatedAt: '2026-05-01T00:00:00.000Z',
		trashedAt: null,
		...overrides,
	};
}

function createPending(overrides: Partial<PendingOperationRecord> = {}): PendingOperationRecord {
	return {
		memoId: 'memo-1',
		kind: 'update' as SyncOperationKind,
		patch: { title: 'updated', content: '<p>updated</p>' },
		clientUpdatedAt: '2026-05-02T00:00:00.000Z',
		enqueuedAt: '2026-05-02T00:00:00.000Z',
		retryCount: 0,
		...overrides,
	};
}

interface ApiCalls {
	updateMemo: Array<{ id: string; data: MemoSyncUpdatePayload }>;
	trashMemo: string[];
	permanentDeleteMemo: string[];
	getMemos: number;
}

function createApiSpy(): { api: MemoSyncApi; calls: ApiCalls; queue: ApiQueue } {
	const calls: ApiCalls = { updateMemo: [], trashMemo: [], permanentDeleteMemo: [], getMemos: 0 };
	const queue: ApiQueue = {
		updateMemo: [],
		trashMemo: [],
		permanentDeleteMemo: [],
		getMemos: [],
	};

	const consume = <T>(slot: T[], label: string): T => {
		const next = slot.shift();
		if (next === undefined) throw new Error(`api spy: no more ${label} responses queued`);
		return next;
	};

	const api: MemoSyncApi = {
		async updateMemo(id, data) {
			calls.updateMemo.push({ id, data });
			const r = consume(queue.updateMemo, 'updateMemo');
			if (typeof r === 'function') return await r();
			return r;
		},
		async trashMemo(id) {
			calls.trashMemo.push(id);
			const r = consume(queue.trashMemo, 'trashMemo');
			if (typeof r === 'function') return await r();
			return r;
		},
		async permanentDeleteMemo(id) {
			calls.permanentDeleteMemo.push(id);
			const r = consume(queue.permanentDeleteMemo, 'permanentDeleteMemo');
			if (typeof r === 'function') return await r();
			return r;
		},
		async getMemos() {
			calls.getMemos += 1;
			const r = consume(queue.getMemos, 'getMemos');
			if (typeof r === 'function') return await r();
			return r;
		},
	};
	return { api, calls, queue };
}

type ApiResponse<T> = T | (() => Promise<T>);
interface ApiQueue {
	updateMemo: ApiResponse<ServerMemoSnapshot>[];
	trashMemo: ApiResponse<ServerMemoSnapshot>[];
	permanentDeleteMemo: ApiResponse<ServerMemoSnapshot>[];
	getMemos: ApiResponse<ServerMemoSnapshot[]>[];
}

function createTelemetrySpy(): SyncTelemetry & {
	breadcrumbCalls: Parameters<SyncTelemetry['breadcrumb']>[];
	exhaustedCalls: Parameters<SyncTelemetry['reportRetryExhausted']>[];
} {
	const t = {
		breadcrumbCalls: [] as Parameters<SyncTelemetry['breadcrumb']>[],
		exhaustedCalls: [] as Parameters<SyncTelemetry['reportRetryExhausted']>[],
		breadcrumb: (...args: Parameters<SyncTelemetry['breadcrumb']>) => {
			t.breadcrumbCalls.push(args);
		},
		reportRetryExhausted: (...args: Parameters<SyncTelemetry['reportRetryExhausted']>) => {
			t.exhaustedCalls.push(args);
		},
	};
	return t;
}

interface BuildHarnessOptions extends Partial<SyncEngineOptions> {
	leader?: boolean | LeaderElection;
}

function makeFakeLeaderElection(asLeader: boolean): LeaderElection {
	let active = false;
	return {
		async start() {
			active = true;
		},
		stop() {
			active = false;
		},
		isLeader() {
			return active && asLeader;
		},
	};
}

async function buildEngine(
	repo: OfflineMemoRepository,
	api: MemoSyncApi,
	overrides: BuildHarnessOptions = {},
): Promise<SyncEngine> {
	const { leader, ...rest } = overrides;
	let leaderElection: LeaderElection;
	if (leader && typeof leader === 'object') {
		leaderElection = leader;
	} else {
		const asLeader = leader !== false;
		leaderElection = makeFakeLeaderElection(asLeader);
	}
	const engine = createSyncEngine({
		repository: repo,
		api,
		leaderElection,
		isOnline: () => true,
		initialBackoffMs: 1,
		maxBackoffMs: 4,
		maxRetries: 3,
		sleep: () => Promise.resolve(),
		...rest,
	});
	await engine.start();
	return engine;
}

describe('SyncEngine — 起動 / 停止 / リーダー選出', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});
	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('start で isRunning が true、stop で false に戻る', async () => {
		const { repo, db } = await setupRepo();
		const { api } = createApiSpy();
		const engine = await buildEngine(repo, api);

		expect(engine.isRunning()).toBe(true);
		engine.stop();
		expect(engine.isRunning()).toBe(false);
		db.close();
	});

	it('リーダーでないタブの triggerDrainNow は aborted: not-leader', async () => {
		const { repo, db } = await setupRepo();
		const { api } = createApiSpy();
		const engine = await buildEngine(repo, api, { leader: false });
		const result = await engine.triggerDrainNow();
		expect(result).toEqual({ kind: 'aborted', reason: 'not-leader' });
		engine.stop();
		db.close();
	});

	it('isOnline が false なら aborted: no-network を返しドレインしない', async () => {
		const { repo, db } = await setupRepo();
		const { api, calls } = createApiSpy();
		const engine = await buildEngine(repo, api, { isOnline: () => false });
		const result = await engine.triggerDrainNow();
		expect(result).toEqual({ kind: 'aborted', reason: 'no-network' });
		expect(calls.updateMemo).toHaveLength(0);
		engine.stop();
		db.close();
	});
});

describe('SyncEngine — ドレインサイクル本体', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});
	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('update pending を成功送信し、succeeded カウントとサーバー版での上書きを行う', async () => {
		const { repo, db } = await setupRepo();
		await repo.upsertFromServer([createSnapshot()]);
		await repo.enqueueOperation(createPending());

		const { api, queue, calls } = createApiSpy();
		const updated = createSnapshot({
			title: 'updated',
			content: '<p>updated</p>',
			updatedAt: '2026-05-02T00:00:00.000Z',
		});
		queue.updateMemo.push(updated);
		queue.getMemos.push([updated]);

		const engine = await buildEngine(repo, api);
		const result = await engine.triggerDrainNow();

		expect(result.kind).toBe('completed');
		if (result.kind === 'completed') {
			expect(result.succeeded).toBe(1);
			expect(result.skippedByLww).toEqual([]);
			expect(result.removedOnServer).toEqual([]);
			expect(result.failed).toBe(0);
		}
		expect(calls.updateMemo[0]).toEqual({
			id: 'memo-1',
			data: {
				title: 'updated',
				content: '<p>updated</p>',
				clientUpdatedAt: '2026-05-02T00:00:00.000Z',
			},
		});
		expect(await repo.listPending()).toHaveLength(0);
		const cached = await repo.getMemo('memo-1');
		expect(cached?.title).toBe('updated');
		expect(cached?.syncStatus).toBe('synced');
		expect(calls.getMemos).toBe(1);
		engine.stop();
		db.close();
	});

	it('409 conflict のときはサーバー版でローカル上書きし skippedByLww に追加する', async () => {
		const { repo, db } = await setupRepo();
		await repo.upsertFromServer([createSnapshot()]);
		await repo.enqueueOperation(createPending());

		const { api, queue } = createApiSpy();
		const serverNewer = createSnapshot({
			title: 'server-newer',
			content: '<p>from another device</p>',
			updatedAt: '2026-05-03T00:00:00.000Z',
		});
		queue.updateMemo.push(() =>
			Promise.reject(
				new MemoSyncApiError(409, 'CONFLICT', { error: 'CONFLICT', current: serverNewer }),
			),
		);
		queue.getMemos.push([serverNewer]);

		const engine = await buildEngine(repo, api);
		const result = await engine.triggerDrainNow();

		expect(result.kind).toBe('completed');
		if (result.kind === 'completed') {
			expect(result.skippedByLww).toEqual([{ memoId: 'memo-1', title: 'server-newer' }]);
			expect(result.succeeded).toBe(0);
		}
		const cached = await repo.getMemo('memo-1');
		expect(cached?.title).toBe('server-newer');
		expect(cached?.syncStatus).toBe('synced');
		expect(await repo.listPending()).toHaveLength(0);
		engine.stop();
		db.close();
	});

	it('404 のときはローカルからメモを削除し removedOnServer に追加する', async () => {
		const { repo, db } = await setupRepo();
		await repo.upsertFromServer([createSnapshot({ title: 'gone-soon' })]);
		await repo.enqueueOperation(createPending());

		const { api, queue } = createApiSpy();
		queue.updateMemo.push(() => Promise.reject(new MemoSyncApiError(404, 'Not Found')));
		queue.getMemos.push([]);

		const engine = await buildEngine(repo, api);
		const result = await engine.triggerDrainNow();

		expect(result.kind).toBe('completed');
		if (result.kind === 'completed') {
			expect(result.removedOnServer).toEqual([{ memoId: 'memo-1', title: 'gone-soon' }]);
		}
		expect(await repo.getMemo('memo-1')).toBeNull();
		expect(await repo.listPending()).toHaveLength(0);
		engine.stop();
		db.close();
	});

	it('401 受信時はサイクル中断、auth-required イベントを発火、保留キューは保持', async () => {
		const { repo, db } = await setupRepo();
		await repo.upsertFromServer([createSnapshot()]);
		await repo.enqueueOperation(createPending());

		const { api, queue } = createApiSpy();
		queue.updateMemo.push(() => Promise.reject(new MemoSyncApiError(401, 'Unauthorized')));

		const events: SyncEvent[] = [];
		const engine = await buildEngine(repo, api);
		engine.subscribe((e) => events.push(e));

		const result = await engine.triggerDrainNow();

		expect(result.kind).toBe('paused');
		if (result.kind === 'paused') {
			expect(result.reason).toBe('auth');
			expect(result.pendingCount).toBe(1);
		}
		expect(events.some((e) => e.type === 'auth-required')).toBe(true);
		expect(await repo.listPending()).toHaveLength(1);
		engine.stop();
		db.close();
	});

	it('trash kind の pending では api.trashMemo を呼び、permanentDelete kind では permanentDeleteMemo を呼ぶ', async () => {
		const { repo, db } = await setupRepo();
		await repo.upsertFromServer([
			createSnapshot({ id: 'memo-A', title: 'A' }),
			createSnapshot({ id: 'memo-B', title: 'B' }),
		]);
		await repo.enqueueOperation(
			createPending({
				memoId: 'memo-A',
				kind: 'trash',
				enqueuedAt: '2026-05-02T00:00:00.000Z',
			}),
		);
		await repo.enqueueOperation(
			createPending({
				memoId: 'memo-B',
				kind: 'permanentDelete',
				enqueuedAt: '2026-05-02T00:00:01.000Z',
			}),
		);

		const { api, queue, calls } = createApiSpy();
		queue.trashMemo.push(
			createSnapshot({
				id: 'memo-A',
				title: 'A',
				trashedAt: '2026-05-02T00:00:00.000Z',
				updatedAt: '2026-05-02T00:00:00.000Z',
			}),
		);
		queue.permanentDeleteMemo.push(
			createSnapshot({
				id: 'memo-B',
				title: 'B',
				updatedAt: '2026-05-02T00:00:01.000Z',
			}),
		);
		queue.getMemos.push([]);

		const engine = await buildEngine(repo, api);
		const result = await engine.triggerDrainNow();

		expect(result.kind).toBe('completed');
		expect(calls.trashMemo).toEqual(['memo-A']);
		expect(calls.permanentDeleteMemo).toEqual(['memo-B']);
		expect(await repo.listPending()).toHaveLength(0);
		engine.stop();
		db.close();
	});
});

describe('SyncEngine — 5xx リトライと指数バックオフ', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});
	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('5xx 連続失敗で最大 3 回までリトライし、上限到達で reportRetryExhausted', async () => {
		const { repo, db } = await setupRepo();
		await repo.upsertFromServer([createSnapshot()]);
		await repo.enqueueOperation(createPending());

		const { api, queue } = createApiSpy();
		const fail500 = () => Promise.reject(new MemoSyncApiError(500, 'Internal Server Error'));
		queue.updateMemo.push(fail500, fail500, fail500);
		queue.getMemos.push([createSnapshot()]);

		const telemetry = createTelemetrySpy();
		const engine = await buildEngine(repo, api, { telemetry });

		const result = await engine.triggerDrainNow();
		expect(result.kind).toBe('completed');
		if (result.kind === 'completed') {
			expect(result.failed).toBe(1);
		}
		expect(telemetry.exhaustedCalls.length).toBe(1);
		expect(telemetry.exhaustedCalls[0][0]).toMatchObject({ memoId: 'memo-1', statusCode: 500 });
		// 保留キューは残す（pending は失敗した時点で残置、retryCount を増やす方針）
		const remaining = await repo.listPending();
		expect(remaining.length).toBe(1);
		expect(remaining[0].retryCount).toBeGreaterThanOrEqual(3);
		engine.stop();
		db.close();
	});

	it('5xx 1 回失敗 → 2 回目成功なら succeeded:1 として完了', async () => {
		const { repo, db } = await setupRepo();
		await repo.upsertFromServer([createSnapshot()]);
		await repo.enqueueOperation(createPending());

		const { api, queue } = createApiSpy();
		queue.updateMemo.push(
			() => Promise.reject(new MemoSyncApiError(503, 'Service Unavailable')),
			createSnapshot({ updatedAt: '2026-05-02T00:00:00.000Z' }),
		);
		queue.getMemos.push([createSnapshot()]);

		const engine = await buildEngine(repo, api);
		const result = await engine.triggerDrainNow();

		expect(result.kind).toBe('completed');
		if (result.kind === 'completed') {
			expect(result.succeeded).toBe(1);
			expect(result.failed).toBe(0);
		}
		engine.stop();
		db.close();
	});
});

describe('SyncEngine — SyncEvent 発火', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});
	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('cycle-start と cycle-complete を順序通り発火する', async () => {
		const { repo, db } = await setupRepo();
		await repo.upsertFromServer([createSnapshot()]);
		await repo.enqueueOperation(createPending());

		const { api, queue } = createApiSpy();
		queue.updateMemo.push(createSnapshot({ updatedAt: '2026-05-02T00:00:00.000Z' }));
		queue.getMemos.push([createSnapshot()]);

		const engine = await buildEngine(repo, api);
		const events: SyncEvent[] = [];
		engine.subscribe((e) => events.push(e));

		await engine.triggerDrainNow();

		const types = events.map((e) => e.type);
		expect(types[0]).toBe('cycle-start');
		expect(types[types.length - 1]).toBe('cycle-complete');
		const last = events[events.length - 1];
		if (last.type === 'cycle-complete') {
			expect(last.result.kind).toBe('completed');
		}
		engine.stop();
		db.close();
	});

	it('保留キュー件数の変化で pending-changed を発火する', async () => {
		const { repo, db } = await setupRepo();
		await repo.upsertFromServer([createSnapshot()]);

		const { api, queue } = createApiSpy();
		queue.updateMemo.push(createSnapshot({ updatedAt: '2026-05-02T00:00:00.000Z' }));
		queue.getMemos.push([createSnapshot()]);

		const engine = await buildEngine(repo, api);
		const counts: number[] = [];
		engine.subscribe((e) => {
			if (e.type === 'pending-changed') counts.push(e.count);
		});

		await repo.enqueueOperation(createPending());
		await engine.notifyEnqueueChanged();
		await engine.triggerDrainNow();

		expect(counts.length).toBeGreaterThanOrEqual(2);
		expect(counts[counts.length - 1]).toBe(0);
		engine.stop();
		db.close();
	});
});

describe('SyncEngine — ミューテックスと再ドレイン', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});
	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('triggerDrainNow を 2 回同時呼びしても、本処理は 1 回しか走らない', async () => {
		const { repo, db } = await setupRepo();
		await repo.upsertFromServer([createSnapshot()]);
		await repo.enqueueOperation(createPending());

		const { api, queue, calls } = createApiSpy();
		// 1 回目の updateMemo で待機させる
		let resolveFirst: (() => void) | null = null;
		const blocker = new Promise<void>((r) => {
			resolveFirst = r;
		});
		queue.updateMemo.push(async () => {
			await blocker;
			return createSnapshot({ updatedAt: '2026-05-02T00:00:00.000Z' });
		});
		queue.getMemos.push([createSnapshot()]);

		const engine = await buildEngine(repo, api);

		const p1 = engine.triggerDrainNow();
		const p2 = engine.triggerDrainNow();
		// 2 回目は in-flight cycle に乗る
		resolveFirst?.();
		const [r1, r2] = await Promise.all([p1, p2]);

		expect(calls.updateMemo).toHaveLength(1);
		expect(r1).toEqual(r2);
		engine.stop();
		db.close();
	});

	it('サイクル中に enqueue された新規エントリは現サイクルでは送らず、完了後の再ドレインで送られる', async () => {
		const { repo, db } = await setupRepo();
		await repo.upsertFromServer([
			createSnapshot({ id: 'memo-A', title: 'A' }),
			createSnapshot({ id: 'memo-B', title: 'B' }),
		]);
		await repo.enqueueOperation(
			createPending({ memoId: 'memo-A', enqueuedAt: '2026-05-02T00:00:00.000Z' }),
		);

		const { api, queue, calls } = createApiSpy();
		let mid = false;
		queue.updateMemo.push(async () => {
			// この呼び出し中に新規エンキュー
			if (!mid) {
				mid = true;
				await repo.enqueueOperation(
					createPending({ memoId: 'memo-B', enqueuedAt: '2026-05-02T00:00:01.000Z' }),
				);
				await engineRef.engine?.notifyEnqueueChanged();
			}
			return createSnapshot({
				id: 'memo-A',
				title: 'A',
				updatedAt: '2026-05-02T00:00:00.000Z',
			});
		});
		queue.updateMemo.push(
			createSnapshot({ id: 'memo-B', title: 'B', updatedAt: '2026-05-02T00:00:01.000Z' }),
		);
		queue.getMemos.push([], []);

		const engineRef: { engine: SyncEngine | null } = { engine: null };
		const engine = await buildEngine(repo, api);
		engineRef.engine = engine;

		const result = await engine.triggerDrainNow();
		// 自動再ドレインを待つ
		await engine.waitForIdle();

		expect(calls.updateMemo).toHaveLength(2);
		expect(calls.updateMemo[0].id).toBe('memo-A');
		expect(calls.updateMemo[1].id).toBe('memo-B');
		expect(result.kind).toBe('completed');
		expect(await repo.listPending()).toHaveLength(0);
		engine.stop();
		db.close();
	});
});

describe('SyncEngine — getLastSyncAt / breadcrumb', () => {
	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});
	afterEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
	});

	it('cycle 完了で getLastSyncAt が更新され、breadcrumb が呼ばれる', async () => {
		const { repo, db } = await setupRepo();
		await repo.upsertFromServer([createSnapshot()]);
		await repo.enqueueOperation(createPending());

		const { api, queue } = createApiSpy();
		queue.updateMemo.push(createSnapshot({ updatedAt: '2026-05-02T00:00:00.000Z' }));
		queue.getMemos.push([createSnapshot()]);

		const telemetry = createTelemetrySpy();
		const engine = await buildEngine(repo, api, { telemetry });

		expect(engine.getLastSyncAt()).toBeNull();
		await engine.triggerDrainNow();
		expect(engine.getLastSyncAt()).not.toBeNull();
		expect(telemetry.breadcrumbCalls.some(([stage]) => stage === 'cycle-start')).toBe(true);
		expect(telemetry.breadcrumbCalls.some(([stage]) => stage === 'success')).toBe(true);
		engine.stop();
		db.close();
	});
});

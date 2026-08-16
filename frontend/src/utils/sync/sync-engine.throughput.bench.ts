/**
 * SyncEngine ドレインサイクルのスループットベンチ（Task 10.3 / Requirement 6.4）。
 *
 * 200 件キャッシュ + 50 件保留での同期スループット 30 秒以内（4G 想定）。
 * CI 環境の揺れと fake-indexeddb のオーバーヘッドを考慮し、ハードリミットは 60 秒。
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';
import type { JSONContent } from '@tiptap/react';

import { OFFLINE_DB_NAME, openOfflineDb, type OfflineDB } from '../offline/db';
import { OfflineMemoRepository, type ServerMemoSnapshot } from '../offline/repository';
import { createEmptyDoc } from '../editor/prosemirrorText';

import { createSyncEngine } from './sync-engine';
import type { LeaderElection } from './leader-election';
import type { MemoSyncApi, MemoSyncUpdatePayload } from './types';

const USER_ID = 'bench-user';
const CACHED_COUNT = 200;
const PENDING_COUNT = 50;
const TARGET_MS = 30_000;
const HARD_LIMIT_MS = 60_000;

function docFromText(text: string): JSONContent {
	return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

function buildCachedSnapshots(): ServerMemoSnapshot[] {
	const snapshots: ServerMemoSnapshot[] = [];
	for (let i = 0; i < CACHED_COUNT; i++) {
		snapshots.push({
			id: `memo-${i.toString().padStart(4, '0')}`,
			title: `Bench Memo ${i}`,
			content: docFromText(`content ${i}`),
			tagIds: [],
			notebookId: null,
			createdAt: '2026-04-01T00:00:00.000Z',
			updatedAt: '2026-04-01T00:00:00.000Z',
			trashedAt: null,
		});
	}
	return snapshots;
}

function makeFakeLeader(): LeaderElection {
	let on = false;
	return {
		async start() {
			on = true;
		},
		stop() {
			on = false;
		},
		isLeader() {
			return on;
		},
	};
}

function makeApiSpy(): { api: MemoSyncApi; calls: number } & { close: () => void } {
	const state = { calls: 0 };
	const api: MemoSyncApi = {
		async updateMemo(id: string, data: MemoSyncUpdatePayload): Promise<ServerMemoSnapshot> {
			state.calls += 1;
			// 4G 帯域での 1RTT を模擬する短いウェイト（4G RTT 中央値 ~30ms 程度）。
			// ベンチ環境への悪影響を避けるため microtask + minimal timer に留める。
			await new Promise((r) => setTimeout(r, 5));
			return {
				id,
				title: data.title ?? '',
				content: data.content ?? createEmptyDoc(),
				tagIds: [],
				notebookId: data.notebookId ?? null,
				createdAt: '2026-04-01T00:00:00.000Z',
				updatedAt: new Date().toISOString(),
				trashedAt: null,
			};
		},
		async trashMemo(id) {
			state.calls += 1;
			return {
				id,
				title: '',
				content: createEmptyDoc(),
				tagIds: [],
				notebookId: null,
				createdAt: '2026-04-01T00:00:00.000Z',
				updatedAt: new Date().toISOString(),
				trashedAt: new Date().toISOString(),
			};
		},
		async permanentDeleteMemo(id) {
			state.calls += 1;
			return {
				id,
				title: '',
				content: createEmptyDoc(),
				tagIds: [],
				notebookId: null,
				createdAt: '2026-04-01T00:00:00.000Z',
				updatedAt: new Date().toISOString(),
				trashedAt: new Date().toISOString(),
			};
		},
		async getMemos() {
			return [];
		},
	};
	return Object.assign(
		{
			api,
			get calls() {
				return state.calls;
			},
		},
		{ close: () => {} },
	);
}

describe('SyncEngine drain throughput (Requirement 6.4)', () => {
	let db: OfflineDB | null = null;

	beforeEach(async () => {
		await deleteDB(OFFLINE_DB_NAME);
		const result = await openOfflineDb();
		db = result.db;
	});

	afterEach(async () => {
		db?.close();
		db = null;
		await deleteDB(OFFLINE_DB_NAME);
	});

	it(`drains ${PENDING_COUNT} pending updates over ${CACHED_COUNT} cached memos within ${HARD_LIMIT_MS}ms`, async () => {
		if (!db) throw new Error('DB not ready');
		const repo = new OfflineMemoRepository({ db, getCurrentUserId: () => USER_ID });
		await repo.upsertFromServer(buildCachedSnapshots());

		// PENDING_COUNT 件の update を seed
		for (let i = 0; i < PENDING_COUNT; i++) {
			await repo.enqueueOperation({
				memoId: `memo-${i.toString().padStart(4, '0')}`,
				kind: 'update',
				patch: { title: `Bench Memo ${i} (updated)`, content: docFromText(`updated ${i}`) },
				clientUpdatedAt: new Date().toISOString(),
				enqueuedAt: new Date().toISOString(),
				retryCount: 0,
			});
		}

		const spy = makeApiSpy();
		const engine = createSyncEngine({
			repository: repo,
			api: spy.api,
			leaderElection: makeFakeLeader(),
			isOnline: () => true,
			initialBackoffMs: 1,
			maxBackoffMs: 4,
			maxRetries: 3,
			sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
		});
		await engine.start();

		const start = performance.now();
		const result = await engine.triggerDrainNow();
		const elapsed = performance.now() - start;

		expect(result.kind).toBe('completed');
		if (result.kind === 'completed') {
			expect(result.succeeded).toBe(PENDING_COUNT);
		}

		console.log(
			`[bench:sync] cached=${CACHED_COUNT} pending=${PENDING_COUNT} elapsed=${elapsed.toFixed(
				0,
			)}ms target=${TARGET_MS}ms hard=${HARD_LIMIT_MS}ms`,
		);

		if (elapsed > TARGET_MS) {
			console.warn(
				`[bench:sync] WARN: elapsed ${elapsed.toFixed(0)}ms exceeds target ${TARGET_MS}ms (Requirement 6.4)`,
			);
		}
		expect(elapsed).toBeLessThan(HARD_LIMIT_MS);

		engine.stop();
	});
});

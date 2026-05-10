import type { CachedMemoRecord, OfflineDB, PendingOperationRecord, SyncOperationKind } from './db';
import { isValidIso8601 } from './iso8601';
import type { QuotaManager } from './quota';
import { stripHtml } from './strip-html';

export interface ServerMemoSnapshot {
	id: string;
	title: string;
	content: string;
	tagIds: string[];
	notebookId: string | null;
	createdAt: string;
	updatedAt: string;
	trashedAt: string | null;
}

export interface ListMemosFilter {
	tagIds?: string[];
	notebookId?: string | null;
}

export interface OfflineRepositoryTelemetry {
	warnInvalidIso8601(payload: { memoId: string; kind: SyncOperationKind; value: string }): void;
}

export interface OfflineRepositoryOptions {
	db: OfflineDB;
	getCurrentUserId: () => string | null;
	quotaManager?: QuotaManager;
	telemetry?: OfflineRepositoryTelemetry;
}

export interface OfflineEditInput {
	memo: CachedMemoRecord;
	operation: PendingOperationRecord;
}

export interface SearchHit {
	memo: CachedMemoRecord;
	snippet: string;
}

export interface SearchResult {
	hits: SearchHit[];
	outOfCacheRange: boolean;
}

const SNIPPET_CONTEXT_RADIUS = 30;

function makeSnippet(source: string, matchIdx: number, matchLen: number): string {
	const start = Math.max(0, matchIdx - SNIPPET_CONTEXT_RADIUS);
	const end = Math.min(source.length, matchIdx + matchLen + SNIPPET_CONTEXT_RADIUS);
	const prefix = start > 0 ? '…' : '';
	const suffix = end < source.length ? '…' : '';
	return `${prefix}${source.slice(start, end)}${suffix}`;
}

export class OfflineMemoRepository {
	private readonly opts: OfflineRepositoryOptions;

	constructor(opts: OfflineRepositoryOptions) {
		this.opts = opts;
	}

	private requireUserId(): string {
		const id = this.opts.getCurrentUserId();
		if (!id) {
			throw new Error('OfflineMemoRepository: no current user is available');
		}
		return id;
	}

	async listMemos(filter: ListMemosFilter = {}): Promise<CachedMemoRecord[]> {
		const userId = this.requireUserId();
		const tx = this.opts.db.transaction('memos', 'readonly');
		const all = await tx.objectStore('memos').index('byUser').getAll(userId);
		await tx.done;

		let filtered = all.filter((memo) => memo.trashedAt === null);

		if (filter.notebookId !== undefined) {
			filtered = filtered.filter((memo) => memo.notebookId === filter.notebookId);
		}

		if (filter.tagIds && filter.tagIds.length > 0) {
			const wanted = new Set(filter.tagIds);
			filtered = filtered.filter((memo) => memo.tagIds.some((tag) => wanted.has(tag)));
		}

		filtered.sort((a, b) => {
			if (a.updatedAt === b.updatedAt) return 0;
			return a.updatedAt < b.updatedAt ? 1 : -1;
		});

		return filtered;
	}

	async getMemo(id: string): Promise<CachedMemoRecord | null> {
		const userId = this.requireUserId();
		const memo = await this.opts.db.get('memos', id);
		if (!memo || memo.userId !== userId) return null;
		return memo;
	}

	async upsertFromServer(memos: ReadonlyArray<ServerMemoSnapshot>): Promise<void> {
		const userId = this.requireUserId();
		const tx = this.opts.db.transaction('memos', 'readwrite');
		const store = tx.objectStore('memos');
		for (const snapshot of memos) {
			const existing = await store.get(snapshot.id);
			// 未送信ローカル編集（offline-saved）はサーバー差分で上書きしない。
			// 同期完了後に SyncEngine が status を 'synced' に戻してから次回 upsert で更新される。
			if (existing && existing.syncStatus === 'offline-saved') continue;
			const record: CachedMemoRecord = {
				id: snapshot.id,
				userId,
				title: snapshot.title,
				content: snapshot.content,
				searchableText: stripHtml(snapshot.content),
				tagIds: [...snapshot.tagIds],
				notebookId: snapshot.notebookId,
				createdAt: snapshot.createdAt,
				updatedAt: snapshot.updatedAt,
				trashedAt: snapshot.trashedAt,
				syncStatus: 'synced',
			};
			await store.put(record);
		}
		await tx.done;

		if (this.opts.quotaManager) {
			await this.opts.quotaManager.enforce(this);
		}
	}

	async saveLocal(memo: CachedMemoRecord): Promise<CachedMemoRecord> {
		const userId = this.requireUserId();
		if (memo.userId !== userId) {
			throw new Error('OfflineMemoRepository.saveLocal: memo.userId does not match current user');
		}
		await this.opts.db.put('memos', memo);
		return memo;
	}

	async enqueueOperation(op: PendingOperationRecord): Promise<void> {
		this.requireUserId();
		this.assertValidClientUpdatedAt(op);
		const tx = this.opts.db.transaction('pending_operations', 'readwrite');
		const store = tx.objectStore('pending_operations');
		const idx = store.index('byMemoId');
		let cursor = await idx.openCursor(op.memoId);
		while (cursor !== null) {
			const c = cursor;
			if (c.value.kind === op.kind) {
				await c.delete();
			}
			cursor = await c.continue();
		}
		await store.add(op);
		await tx.done;
	}

	async listPending(): Promise<PendingOperationRecord[]> {
		this.requireUserId();
		const tx = this.opts.db.transaction('pending_operations', 'readonly');
		const all = await tx.objectStore('pending_operations').index('byEnqueuedAt').getAll();
		await tx.done;
		return all;
	}

	async removePending(memoId: string, kind: SyncOperationKind): Promise<void> {
		this.requireUserId();
		const tx = this.opts.db.transaction('pending_operations', 'readwrite');
		const idx = tx.objectStore('pending_operations').index('byMemoId');
		let cursor = await idx.openCursor(memoId);
		while (cursor !== null) {
			const c = cursor;
			if (c.value.kind === kind) {
				await c.delete();
			}
			cursor = await c.continue();
		}
		await tx.done;
	}

	async applyOfflineEdit(input: OfflineEditInput): Promise<CachedMemoRecord> {
		const userId = this.requireUserId();
		if (input.memo.userId !== userId) {
			throw new Error(
				'OfflineMemoRepository.applyOfflineEdit: memo.userId does not match current user',
			);
		}
		this.assertValidClientUpdatedAt(input.operation);

		const tx = this.opts.db.transaction(['memos', 'pending_operations'], 'readwrite');
		const opStore = tx.objectStore('pending_operations');
		const idx = opStore.index('byMemoId');
		let cursor = await idx.openCursor(input.operation.memoId);
		while (cursor !== null) {
			const c = cursor;
			if (c.value.kind === input.operation.kind) {
				await c.delete();
			}
			cursor = await c.continue();
		}
		await opStore.add(input.operation);
		await tx.objectStore('memos').put(input.memo);
		await tx.done;
		return input.memo;
	}

	async purgeForUser(userId: string): Promise<void> {
		const tx = this.opts.db.transaction(['memos', 'pending_operations', 'meta'], 'readwrite');
		const memosStore = tx.objectStore('memos');
		const purgedIds = new Set<string>();
		let cursor = await memosStore.index('byUser').openCursor(userId);
		while (cursor !== null) {
			const c = cursor;
			purgedIds.add(c.value.id);
			await c.delete();
			cursor = await c.continue();
		}

		if (purgedIds.size > 0) {
			const pendingStore = tx.objectStore('pending_operations');
			let pendingCursor = await pendingStore.openCursor();
			while (pendingCursor !== null) {
				const c = pendingCursor;
				if (purgedIds.has(c.value.memoId)) {
					await c.delete();
				}
				pendingCursor = await c.continue();
			}
		}

		const metaStore = tx.objectStore('meta');
		const stored = await metaStore.get('currentUserId');
		if (stored && stored.value === userId) {
			await metaStore.delete('currentUserId');
		}

		await tx.done;
	}

	async verifyOwnerOrPurge(currentUserId: string): Promise<void> {
		const stored = await this.opts.db.get('meta', 'currentUserId');
		if (!stored) {
			await this.opts.db.put('meta', { key: 'currentUserId', value: currentUserId });
			return;
		}
		if (stored.value === currentUserId) return;

		if (typeof stored.value === 'string') {
			await this.purgeForUser(stored.value);
		}
		await this.opts.db.put('meta', { key: 'currentUserId', value: currentUserId });
	}

	async search(query: string): Promise<SearchResult> {
		const userId = this.requireUserId();
		const trimmed = query.trim();
		if (trimmed.length === 0) {
			return { hits: [], outOfCacheRange: false };
		}
		const needle = trimmed.toLowerCase();

		const tx = this.opts.db.transaction('memos', 'readonly');
		const all = await tx.objectStore('memos').index('byUser').getAll(userId);
		await tx.done;

		const hits: SearchHit[] = [];
		for (const memo of all) {
			if (memo.trashedAt !== null) continue;
			const titleLower = memo.title.toLowerCase();
			const bodyLower = memo.searchableText.toLowerCase();
			const titleIdx = titleLower.indexOf(needle);
			const bodyIdx = bodyLower.indexOf(needle);
			if (titleIdx < 0 && bodyIdx < 0) continue;
			const source = bodyIdx >= 0 ? memo.searchableText : memo.title;
			const matchIdx = bodyIdx >= 0 ? bodyIdx : titleIdx;
			hits.push({ memo, snippet: makeSnippet(source, matchIdx, needle.length) });
		}

		hits.sort((a, b) => {
			if (a.memo.updatedAt === b.memo.updatedAt) return 0;
			return a.memo.updatedAt < b.memo.updatedAt ? 1 : -1;
		});

		return { hits, outOfCacheRange: hits.length === 0 };
	}

	private assertValidClientUpdatedAt(op: PendingOperationRecord): void {
		if (isValidIso8601(op.clientUpdatedAt)) return;
		this.opts.telemetry?.warnInvalidIso8601({
			memoId: op.memoId,
			kind: op.kind,
			value: op.clientUpdatedAt,
		});
		throw new Error(
			`OfflineMemoRepository: invalid clientUpdatedAt for memo=${op.memoId}: ${String(
				op.clientUpdatedAt,
			)}`,
		);
	}
}

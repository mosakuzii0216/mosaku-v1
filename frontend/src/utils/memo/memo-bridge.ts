import type { Memo, CreateMemoDto, UpdateMemoDto } from '../../types/memo';
import type { PaginationParams, PaginatedResult } from '../../types/pagination';
import type { OfflineSavedSignal } from '../../hooks/useAutoSave';
import { OFFLINE_SAVED_SIGNAL } from '../../hooks/useAutoSave';
import type { CachedMemoRecord, PendingOperationRecord } from '../offline/db';
import type { OfflineMemoRepository, ServerMemoSnapshot } from '../offline/repository';
import type { ApiClientLike } from './types';

function memoToSnapshot(memo: Memo): ServerMemoSnapshot {
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
}

function cachedToMemo(record: CachedMemoRecord): Memo {
	return {
		id: record.id,
		title: record.title,
		content: record.content,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		trashedAt: record.trashedAt,
		notebookId: record.notebookId,
	};
}

export type MemoUpdateOutcome =
	| { kind: 'synced'; memo: Memo }
	| { kind: 'offline-saved'; memo: Memo; signal: OfflineSavedSignal };

export interface MemoBridgeOptions {
	repository?: OfflineMemoRepository;
	api?: ApiClientLike;
	isOnline?: () => boolean;
	now?: () => Date;
}

export class MemoBridge {
	private readonly repo: OfflineMemoRepository;
	private readonly api: ApiClientLike;
	private readonly isOnline: () => boolean;
	private readonly now: () => Date;

	constructor(opts: MemoBridgeOptions) {
		if (!opts.repository) {
			throw new Error('MemoBridge: repository is required');
		}
		if (!opts.api) {
			throw new Error('MemoBridge: api is required');
		}
		this.repo = opts.repository;
		this.api = opts.api;
		this.isOnline = opts.isOnline ?? (() => true);
		this.now = opts.now ?? (() => new Date());
	}

	async listMemos(tagIds?: string[]): Promise<Memo[]> {
		if (this.isOnline()) {
			try {
				const memos = await this.api.getMemos(tagIds);
				await this.repo.upsertFromServer(memos.map(memoToSnapshot));
				return memos;
			} catch (err) {
				if (!this.isLikelyNetworkError(err)) throw err;
			}
		}
		const records = await this.repo.listMemos(tagIds && tagIds.length > 0 ? { tagIds } : {});
		return records.map(cachedToMemo);
	}

	async getMemo(id: string): Promise<Memo> {
		if (this.isOnline()) {
			try {
				const memo = await this.api.getMemo(id);
				await this.repo.upsertFromServer([memoToSnapshot(memo)]);
				return memo;
			} catch (err) {
				if (!this.isLikelyNetworkError(err)) throw err;
			}
		}
		const record = await this.repo.getMemo(id);
		if (!record) {
			throw new Error(`MemoBridge: memo ${id} not found in offline cache`);
		}
		return cachedToMemo(record);
	}

	async searchMemos(query: string, tagIds?: string[]): Promise<Memo[]> {
		if (this.isOnline()) {
			try {
				return await this.api.searchMemos(query, tagIds);
			} catch (err) {
				if (!this.isLikelyNetworkError(err)) throw err;
			}
		}
		const result = await this.repo.search(query);
		return result.hits.map((h) => cachedToMemo(h.memo));
	}

	async createMemo(data: CreateMemoDto): Promise<Memo> {
		// 仕様: オフライン中は新規作成不許可
		if (!this.isOnline()) {
			throw new Error('オフライン中はメモを新規作成できません');
		}
		const memo = await this.api.createMemo(data);
		await this.repo.upsertFromServer([memoToSnapshot(memo)]);
		return memo;
	}

	async updateMemo(id: string, data: UpdateMemoDto): Promise<MemoUpdateOutcome> {
		const existing = await this.repo.getMemo(id);
		const clientUpdatedAt = this.now().toISOString();

		if (this.isOnline()) {
			try {
				const memo = await this.api.updateMemo(id, { ...data, clientUpdatedAt });
				await this.repo.markSynced(memoToSnapshot(memo));
				await this.repo.removePending(id, 'update');
				return { kind: 'synced', memo };
			} catch (err) {
				if (!this.isLikelyNetworkError(err)) throw err;
			}
		}

		const record: CachedMemoRecord = {
			id,
			userId: existing?.userId ?? this.requireUserIdFromRecord(existing),
			title: data.title ?? existing?.title ?? '',
			content: data.content ?? existing?.content ?? '',
			searchableText: stripTagsForSearch(data.content ?? existing?.content ?? ''),
			tagIds: existing?.tagIds ?? [],
			notebookId: data.notebookId !== undefined ? data.notebookId : (existing?.notebookId ?? null),
			createdAt: existing?.createdAt ?? clientUpdatedAt,
			updatedAt: clientUpdatedAt,
			trashedAt: existing?.trashedAt ?? null,
			syncStatus: 'offline-saved',
		};
		const operation: PendingOperationRecord = {
			memoId: id,
			kind: 'update',
			patch: {
				title: data.title,
				content: data.content,
				notebookId: data.notebookId !== undefined ? data.notebookId : undefined,
			},
			clientUpdatedAt,
			enqueuedAt: clientUpdatedAt,
			retryCount: 0,
		};
		await this.repo.applyOfflineEdit({ memo: record, operation });
		return { kind: 'offline-saved', memo: cachedToMemo(record), signal: OFFLINE_SAVED_SIGNAL };
	}

	async trashMemo(id: string): Promise<MemoUpdateOutcome> {
		const existing = await this.repo.getMemo(id);
		const clientUpdatedAt = this.now().toISOString();

		if (this.isOnline()) {
			try {
				const memo = await this.api.deleteMemo(id);
				await this.repo.markSynced(memoToSnapshot(memo));
				await this.repo.removePending(id, 'trash');
				return { kind: 'synced', memo };
			} catch (err) {
				if (!this.isLikelyNetworkError(err)) throw err;
			}
		}

		const record: CachedMemoRecord = {
			id,
			userId: existing?.userId ?? this.requireUserIdFromRecord(existing),
			title: existing?.title ?? '',
			content: existing?.content ?? '',
			searchableText: existing?.searchableText ?? '',
			tagIds: existing?.tagIds ?? [],
			notebookId: existing?.notebookId ?? null,
			createdAt: existing?.createdAt ?? clientUpdatedAt,
			updatedAt: clientUpdatedAt,
			trashedAt: clientUpdatedAt,
			syncStatus: 'offline-saved',
		};
		const operation: PendingOperationRecord = {
			memoId: id,
			kind: 'trash',
			clientUpdatedAt,
			enqueuedAt: clientUpdatedAt,
			retryCount: 0,
		};
		await this.repo.applyOfflineEdit({ memo: record, operation });
		return { kind: 'offline-saved', memo: cachedToMemo(record), signal: OFFLINE_SAVED_SIGNAL };
	}

	async permanentDeleteMemo(id: string): Promise<MemoUpdateOutcome> {
		const existing = await this.repo.getMemo(id);
		const clientUpdatedAt = this.now().toISOString();

		if (this.isOnline()) {
			try {
				const memo = await this.api.permanentDeleteMemo(id);
				await this.repo.evictById(id);
				await this.repo.removePending(id, 'permanentDelete');
				return { kind: 'synced', memo };
			} catch (err) {
				if (!this.isLikelyNetworkError(err)) throw err;
			}
		}

		if (!existing) {
			throw new Error(`MemoBridge: cannot permanently delete unknown memo ${id} while offline`);
		}
		const record: CachedMemoRecord = {
			...existing,
			trashedAt: existing.trashedAt ?? clientUpdatedAt,
			updatedAt: clientUpdatedAt,
			syncStatus: 'offline-saved',
		};
		const operation: PendingOperationRecord = {
			memoId: id,
			kind: 'permanentDelete',
			clientUpdatedAt,
			enqueuedAt: clientUpdatedAt,
			retryCount: 0,
		};
		await this.repo.applyOfflineEdit({ memo: record, operation });
		return {
			kind: 'offline-saved',
			memo: cachedToMemo(record),
			signal: OFFLINE_SAVED_SIGNAL,
		};
	}

	async restoreMemo(id: string): Promise<Memo> {
		// 復元はオンライン時のみ対応（仕様の対象外）
		if (!this.isOnline()) {
			throw new Error('オフライン中はメモを復元できません');
		}
		const memo = await this.api.restoreMemo(id);
		await this.repo.markSynced(memoToSnapshot(memo));
		return memo;
	}

	async getTrashMemos(): Promise<Memo[]> {
		if (!this.isOnline()) {
			throw new Error('オフライン中はゴミ箱を表示できません');
		}
		return this.api.getTrashMemos();
	}

	async emptyTrash(): Promise<{ count: number }> {
		if (!this.isOnline()) {
			throw new Error('オフライン中はゴミ箱を空にできません');
		}
		return this.api.emptyTrash();
	}

	async getMemosPaginated(
		pagination: PaginationParams,
		tagIds?: string[],
	): Promise<PaginatedResult<Memo>> {
		if (this.isOnline()) {
			return this.api.getMemosPaginated(pagination, tagIds);
		}
		const records = await this.repo.listMemos(tagIds && tagIds.length > 0 ? { tagIds } : {});
		return paginateLocal(records.map(cachedToMemo), pagination);
	}

	async searchMemosPaginated(
		query: string,
		pagination: PaginationParams,
		tagIds?: string[],
	): Promise<PaginatedResult<Memo>> {
		if (this.isOnline()) {
			return this.api.searchMemosPaginated(query, pagination, tagIds);
		}
		const result = await this.repo.search(query);
		return paginateLocal(
			result.hits.map((h) => cachedToMemo(h.memo)),
			pagination,
		);
	}

	private isLikelyNetworkError(err: unknown): boolean {
		const message = err instanceof Error ? err.message : String(err);
		return (
			message.includes('ネットワークエラー') ||
			message.includes('Failed to fetch') ||
			message.toLowerCase().includes('networkerror')
		);
	}

	private requireUserIdFromRecord(_existing: CachedMemoRecord | null): string {
		// 既存レコードが存在しない更新は通常起きないが、起きた場合は明確に失敗させる。
		throw new Error('MemoBridge: cannot determine userId for offline edit of unknown memo');
	}
}

function paginateLocal<T>(items: T[], pagination: PaginationParams): PaginatedResult<T> {
	const page = pagination.page ?? 1;
	const limit = pagination.limit ?? items.length;
	const start = (page - 1) * limit;
	const slice = items.slice(start, start + limit);
	const total = items.length;
	const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;
	return {
		data: slice,
		pagination: {
			page,
			limit,
			total,
			totalPages,
			hasNextPage: page < totalPages,
			hasPrevPage: page > 1,
		},
	};
}

function stripTagsForSearch(html: string): string {
	return html.replace(/<[^>]*>/g, '').trim();
}

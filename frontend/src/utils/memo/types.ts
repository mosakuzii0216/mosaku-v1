import type { Memo, CreateMemoDto, UpdateMemoDto } from '../../types/memo';
import type { PaginationParams, PaginatedResult } from '../../types/pagination';

export interface UpdateMemoRequestWithClientTime extends UpdateMemoDto {
	clientUpdatedAt?: string;
}

export interface ApiClientLike {
	getMemos(tagIds?: string[]): Promise<Memo[]>;
	getMemo(id: string): Promise<Memo>;
	createMemo(data: CreateMemoDto): Promise<Memo>;
	updateMemo(id: string, data: UpdateMemoRequestWithClientTime): Promise<Memo>;
	deleteMemo(id: string): Promise<Memo>;
	permanentDeleteMemo(id: string): Promise<Memo>;
	restoreMemo(id: string): Promise<Memo>;
	getTrashMemos(): Promise<Memo[]>;
	emptyTrash(): Promise<{ count: number }>;
	searchMemos(query: string, tagIds?: string[]): Promise<Memo[]>;
	getMemosPaginated(
		pagination: PaginationParams,
		tagIds?: string[],
	): Promise<PaginatedResult<Memo>>;
	searchMemosPaginated(
		query: string,
		pagination: PaginationParams,
		tagIds?: string[],
	): Promise<PaginatedResult<Memo>>;
}

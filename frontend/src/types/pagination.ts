/**
 * ページネーションクエリパラメータ
 */
export interface PaginationParams {
	page?: number;
	limit?: number;
}

/**
 * ページネーション情報
 */
export interface PaginationMeta {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

/**
 * ページネーション付きレスポンス
 */
export interface PaginatedResult<T> {
	data: T[];
	pagination: PaginationMeta;
}

/**
 * デフォルトのページネーション設定
 */
export const DEFAULT_PAGINATION: Required<PaginationParams> = {
	page: 1,
	limit: 20,
};

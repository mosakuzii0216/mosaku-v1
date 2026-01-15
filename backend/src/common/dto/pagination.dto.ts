import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * ページネーションクエリDTO
 * 全てのリスト取得APIで使用可能
 */
export class PaginationQueryDto {
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(1)
	page?: number = 1;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(1)
	@Max(100)
	limit?: number = 20;
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
 * ページネーション結果を生成するヘルパー関数
 */
export function createPaginatedResult<T>(
	data: T[],
	total: number,
	page: number,
	limit: number,
): PaginatedResult<T> {
	const totalPages = Math.ceil(total / limit);

	return {
		data,
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

/**
 * ページネーションのskip値を計算
 */
export function calculateSkip(page: number, limit: number): number {
	return (page - 1) * limit;
}

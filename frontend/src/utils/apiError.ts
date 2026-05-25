export interface ApiErrorInit {
	code?: string | null;
	message: string;
	statusCode: number;
}

/**
 * バックエンドの構造化エラー（`{ code, message, statusCode }`）を表す例外。
 * 文字列マッチではなく `error.code` で分岐すること。
 */
export class ApiError extends Error {
	readonly code: string | null;
	readonly statusCode: number;

	constructor(init: ApiErrorInit) {
		super(init.message);
		this.name = 'ApiError';
		this.code = init.code ?? null;
		this.statusCode = init.statusCode;
	}
}

export function isApiError(value: unknown): value is ApiError {
	return value instanceof ApiError;
}

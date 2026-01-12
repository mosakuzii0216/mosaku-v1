import {
	BadRequestException,
	UnauthorizedException,
	ForbiddenException,
	NotFoundException,
	HttpException,
	HttpStatus,
} from '@nestjs/common';
import type { ErrorCode } from './error-codes';
import { ERROR_MESSAGES } from './error-messages';

/**
 * アプリケーション全体で使用する統一されたException
 *
 * エラーコードとメッセージを含む構造化されたエラーレスポンスを提供
 */
export class AppException extends HttpException {
	constructor(
		public readonly code: ErrorCode,
		public readonly statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
		message?: string,
		public readonly details?: unknown,
	) {
		// メッセージが指定されていない場合はエラーコードから取得
		const errorMessage = message || ERROR_MESSAGES[code] || 'エラーが発生しました';

		const response: {
			code: ErrorCode;
			message: string;
			statusCode: HttpStatus;
			details?: unknown;
		} = {
			code,
			message: errorMessage,
			statusCode,
		};

		if (details !== undefined) {
			response.details = details;
		}

		super(response, statusCode);
	}

	/**
	 * 既存のNestJS例外から対応するHTTPステータスコードを取得
	 */
	static getStatusFromException(exception: unknown): HttpStatus {
		if (exception instanceof BadRequestException) return HttpStatus.BAD_REQUEST;
		if (exception instanceof UnauthorizedException) return HttpStatus.UNAUTHORIZED;
		if (exception instanceof ForbiddenException) return HttpStatus.FORBIDDEN;
		if (exception instanceof NotFoundException) return HttpStatus.NOT_FOUND;
		return HttpStatus.INTERNAL_SERVER_ERROR;
	}
}

/**
 * ヘルパー関数: BadRequestException相当
 */
export function throwBadRequest(code: ErrorCode, message?: string, details?: unknown): never {
	throw new AppException(code, HttpStatus.BAD_REQUEST, message, details);
}

/**
 * ヘルパー関数: UnauthorizedException相当
 */
export function throwUnauthorized(code: ErrorCode, message?: string, details?: unknown): never {
	throw new AppException(code, HttpStatus.UNAUTHORIZED, message, details);
}

/**
 * ヘルパー関数: ForbiddenException相当
 */
export function throwForbidden(code: ErrorCode, message?: string, details?: unknown): never {
	throw new AppException(code, HttpStatus.FORBIDDEN, message, details);
}

/**
 * ヘルパー関数: NotFoundException相当
 */
export function throwNotFound(code: ErrorCode, message?: string, details?: unknown): never {
	throw new AppException(code, HttpStatus.NOT_FOUND, message, details);
}

import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';

/**
 * レート制限エラーのカスタムフィルター
 * ユーザーフレンドリーなエラーメッセージを返す
 */
@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
	catch(exception: ThrottlerException, host: ArgumentsHost) {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse<Response>();
		const status = exception.getStatus();

		response.status(status).json({
			statusCode: status,
			message: 'リクエストが多すぎます。しばらく時間をおいてから再度お試しください。',
			error: 'Too Many Requests',
			timestamp: new Date().toISOString(),
		});
	}
}

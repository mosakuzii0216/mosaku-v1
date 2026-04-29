import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import * as Sentry from '@sentry/nestjs';

/**
 * 認証済みリクエストの間だけ Sentry scope に { id: userId } を設定する side-car Interceptor。
 *
 * - PII 方針上、id 以外の情報（email / username / OAuth provider / IP）は scope に渡さない
 * - 公開ルート（req.user が無い）では scope を匿名のまま維持し setUser を呼ばない
 * - JwtAuthGuard の単一責任を崩さないため、Guard 直接改造ではなく Interceptor に分離
 */
@Injectable()
export class SentryUserContextInterceptor implements NestInterceptor {
	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const httpContext = context.switchToHttp();
		const request = httpContext.getRequest<{ user?: { id?: unknown } } | undefined>();

		const userId = request?.user?.id;
		if (typeof userId === 'string' && userId.length > 0) {
			Sentry.getCurrentScope().setUser({ id: userId });
		}

		return next.handle();
	}
}

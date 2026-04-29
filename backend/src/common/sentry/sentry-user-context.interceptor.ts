import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import * as Sentry from '@sentry/nestjs';

// PII 方針上 id のみ設定し、email / OAuth provider / IP は渡さない
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

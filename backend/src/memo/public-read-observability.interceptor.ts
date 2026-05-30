import {
	CallHandler,
	ExecutionContext,
	HttpException,
	Injectable,
	NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { normalizeRoute, PUBLIC_MEMO_NORMALIZED_PATH } from '../common/sentry/sentry-tags';

/**
 * 公開読み取りの構造化メトリクスログのペイロード契約（Cloud Logging が jsonPayload としてパースする）。
 * `message` は Cloud Logging ログベースメトリクスのフィルタ固定キー。`route` は必ず normalizeRoute 済み
 * の値のみで、生トークンを絶対に含めない（Req 1.1 / 6.3 の不変条件）。
 */
export interface PublicReadLogPayload {
	message: 'public_memo_read';
	feature_area: 'memo';
	route: string;
	method: string;
	status: number;
	latency_ms: number;
	severity: 'INFO' | 'ERROR';
}

interface ObservableHttpRequest {
	method?: string;
	originalUrl?: string;
	url?: string;
	path?: string;
}

interface ObservableHttpResponse {
	statusCode?: number;
}

/**
 * 公開読み取り経路（PublicMemoController）専用の横断観測 Interceptor（Req 1.1 / 1.3 / 2.4 / 6.3）。
 *
 * リクエスト完了時（成功・例外問わず）に固定キー `public_memo_read` の構造化 JSON ログを 1 行発出し、
 * Cloud Logging ログベースメトリクスの clean-label な発出源とする。編集経路には適用せず、公開/編集の
 * 発出源を物理的に分離する（モジュール側でコントローラスコープ登録）。
 *
 * 不変条件:
 * - observability は correctness を妨げない → ログ発出失敗・正規化例外は握り潰し、リクエストを中断しない。
 * - 生トークンを payload に含めない → route は normalizeRoute を唯一の経路として通す。
 */
@Injectable()
export class PublicReadObservabilityInterceptor implements NestInterceptor {
	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const http = context.switchToHttp();
		const request = http.getRequest<ObservableHttpRequest | undefined>();
		const response = http.getResponse<ObservableHttpResponse | undefined>();

		const start = Date.now();
		const method = typeof request?.method === 'string' ? request.method : 'GET';
		const route = this.resolveRoute(request);

		const emit = (status: number): void => {
			this.safeEmit({
				message: 'public_memo_read',
				feature_area: 'memo',
				route,
				method,
				status,
				latency_ms: Date.now() - start,
				severity: status >= 500 ? 'ERROR' : 'INFO',
			});
		};

		return next.handle().pipe(
			tap({
				next: () => {
					const status = typeof response?.statusCode === 'number' ? response.statusCode : 200;
					emit(status);
				},
				error: (error: unknown) => emit(this.resolveErrorStatus(error)),
			}),
		);
	}

	// route はコントローラスコープ上 `/memos/public/:token` に正規化される。正規化に失敗しても
	// タグ契約（route 欠落）を破らないよう、公開経路の正規化済みパスをフォールバックに用いる。
	private resolveRoute(request: ObservableHttpRequest | undefined): string {
		try {
			const raw = request?.originalUrl ?? request?.url ?? request?.path;
			if (typeof raw !== 'string' || raw.length === 0) {
				return PUBLIC_MEMO_NORMALIZED_PATH;
			}
			const pathOnly = raw.split('?')[0].split('#')[0];
			return normalizeRoute(pathOnly);
		} catch {
			return PUBLIC_MEMO_NORMALIZED_PATH;
		}
	}

	private resolveErrorStatus(error: unknown): number {
		if (error instanceof HttpException) {
			return error.getStatus();
		}
		return 500;
	}

	// AppLogger のテキストログとは独立した 1 行 JSON として stdout へ発出する。
	// Cloud Run が jsonPayload として自動パースし、`message` でメトリクスフィルタ可能になる。
	private safeEmit(payload: PublicReadLogPayload): void {
		try {
			console.log(JSON.stringify(payload));
		} catch {
			// observability は correctness を妨げない: 発出失敗は握り潰す
		}
	}
}

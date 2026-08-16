import {
	CallHandler,
	ExecutionContext,
	HttpException,
	Injectable,
	NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { normalizeRoute } from '../common/sentry/sentry-tags';

/**
 * 編集経路の構造化メトリクスログのペイロード契約（Cloud Logging が jsonPayload としてパースする）。
 * 公開側 {@link PublicReadLogPayload} と**対称**な型で、`message` だけを `memo_edit_read` に固定する。
 * これにより Cloud Logging ログベースメトリクス上で公開（`public_memo_read`）と編集を混線させず、
 * 編集経路の p95 レイテンシ（Req 2.4）を公開トラフィックの汚染なしに切り出せる。
 */
export interface MemoEditLogPayload {
	message: 'memo_edit_read';
	feature_area: 'memo';
	route: string;
	method: string;
	status: number;
	latency_ms: number;
	severity: 'INFO' | 'ERROR';
}

interface ObservableHttpRequest {
	method?: string;
	route?: { path?: string };
}

interface ObservableHttpResponse {
	statusCode?: number;
}

// route ラベルが取得できない場合のフォールバック。編集系は `/memos` 配下に集約されるため、
// タグ契約（route 欠落）を破らずに高カーディナリティな id を漏らさない安定ラベルへ収束させる。
const MEMO_EDIT_ROUTE_FALLBACK = '/memos';

/**
 * 編集経路（MemoController）専用の横断観測 Interceptor（Req 2.4）。公開側の
 * {@link PublicReadObservabilityInterceptor} と**対称**な薄い実装で、リクエスト完了時（成功・例外問わず）
 * に固定キー `memo_edit_read` の構造化 JSON ログを 1 行発出し、編集経路 route 別レイテンシメトリクス
 * （`memo_edit_latency`）の clean-label な発出源とする。
 *
 * 横断観測のみを行い、既存ハンドラのロジック・`@Public()` opt-out・`AuthorizationService` 一元化には
 * 一切手を入れない。公開側との一方向 DI の継ぎ目（Req 3.1）は、両 Interceptor が `normalizeRoute`
 * という下位共通ユーティリティのみを共有する構成で維持する（編集系サービスへは依存しない）。
 *
 * 不変条件:
 * - observability は correctness を妨げない → ログ発出失敗・正規化例外は握り潰し、リクエストを中断しない。
 * - clean-label をコード側で能動的に担保する → route は Express ルートパターン（`/memos/:id`）を優先し、
 *   生 id 等の高カーディナリティ値を payload に含めない。
 */
@Injectable()
export class MemoEditObservabilityInterceptor implements NestInterceptor {
	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const http = context.switchToHttp();
		const request = http.getRequest<ObservableHttpRequest | undefined>();
		const response = http.getResponse<ObservableHttpResponse | undefined>();

		const start = Date.now();
		const method = typeof request?.method === 'string' ? request.method : 'GET';
		const route = this.resolveRoute(request);

		const emit = (status: number): void => {
			this.safeEmit({
				message: 'memo_edit_read',
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

	// 編集経路の生 URL は `/memos/<uuid>` のように高カーディナリティな id を含み、公開トークン専用の
	// normalizeRoute では除去できない。そこで clean-label を能動的に担保するため、Express の matched
	// route パターン（`/memos/:id`）のみを route ソースとして信頼し、共通 normalizeRoute（下位共通
	// レイヤー）を冪等に通す。パターンが取れない場合は生 URL に退避せず、id を漏らさない安定
	// フォールバックへ収束させる。
	private resolveRoute(request: ObservableHttpRequest | undefined): string {
		try {
			const pattern = request?.route?.path;
			if (typeof pattern === 'string' && pattern.length > 0) {
				return normalizeRoute(pattern);
			}
			return MEMO_EDIT_ROUTE_FALLBACK;
		} catch {
			return MEMO_EDIT_ROUTE_FALLBACK;
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
	private safeEmit(payload: MemoEditLogPayload): void {
		try {
			console.log(JSON.stringify(payload));
		} catch {
			// observability は correctness を妨げない: 発出失敗は握り潰す
		}
	}
}

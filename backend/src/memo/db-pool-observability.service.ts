import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * DB コネクションプール使用率の構造化メトリクスログのペイロード契約
 * （Cloud Logging が jsonPayload としてパースする）。
 * 公開/編集の Interceptor 群と同じ「構造化ログ → ログベースメトリクス → アラート」パイプラインに乗せ、
 * 公開読み取りスパイクが DB 接続を圧迫する兆候（Stage 3 トリガー）を検知可能にする。
 */
export interface DbPoolUtilizationPayload {
	message: 'db_pool_utilization';
	feature_area: 'system';
	used: number; // 現在の DB バックエンド接続数（pg_stat_activity）
	max: number; // 分母（DB_POOL_MAX_CONNECTIONS 優先、無ければ Postgres max_connections）
	util_ratio: number; // used / max（0..1）
	severity: 'INFO' | 'WARNING';
}

interface PgPoolRow {
	used: number | bigint;
	max: number | bigint;
}

// 使用率がこの比率以上で severity を WARNING に引き上げる（runbook §3 の DB プール閾値 80% に整合）。
const WARN_RATIO = 0.8;

/**
 * DB コネクションプール使用率を定期サンプリングして構造化ログを発出する横断観測サービス（Req 2.1 / 2.4 / 5）。
 *
 * Cloud Scheduler 等の新規インフラを足さず、既存の `@nestjs/schedule`（`TrashCleanupService` と同じ足場）で
 * 1 分毎に `pg_stat_activity` の接続数を取得し、`message: "db_pool_utilization"` 固定キーの 1 行 JSON を
 * stdout へ発出する。これを `db_pool_utilization` ログベースメトリクスの発出源とする。
 *
 * 不変条件:
 * - observability は correctness を妨げない → クエリ失敗・パース不能は握り潰し、リクエスト/アプリを止めない。
 * - ゼロ除算を起こさない → max が正の数でないときは発出しない。
 */
@Injectable()
export class DbPoolObservabilityService {
	private readonly logger = new Logger(DbPoolObservabilityService.name);

	constructor(private readonly prisma: PrismaService) {}

	@Cron(CronExpression.EVERY_MINUTE)
	async sampleDbPoolUtilization(): Promise<void> {
		let used: number;
		let serverMax: number;
		try {
			// 静的クエリ（ユーザー入力なし）。現在の DB への接続数と Postgres の max_connections を取得する。
			const rows = await this.prisma.$queryRawUnsafe<PgPoolRow[]>(
				"SELECT count(*)::int AS used, current_setting('max_connections')::int AS max " +
					'FROM pg_stat_activity WHERE datname = current_database()',
			);
			const row = Array.isArray(rows) ? rows[0] : undefined;
			if (!row) {
				return;
			}
			used = Number(row.used);
			serverMax = Number(row.max);
		} catch {
			// observability は correctness を妨げない: 取得失敗は握り潰す
			this.logger.warn('DB プール使用率のサンプリングに失敗しました（観測のみ・処理は継続）');
			return;
		}

		const max = this.resolveMax(serverMax);
		if (!Number.isFinite(used) || !Number.isFinite(max) || max <= 0) {
			// ゼロ除算・不正値を回避（発出しない）
			return;
		}

		const utilRatio = used / max;
		this.safeEmit({
			message: 'db_pool_utilization',
			feature_area: 'system',
			used,
			max,
			util_ratio: utilRatio,
			severity: utilRatio >= WARN_RATIO ? 'WARNING' : 'INFO',
		});
	}

	// 分母は実運用のプール上限（Supabase pooler のプールサイズ等）を環境変数で上書き可能にする。
	// 未設定時は Postgres サーバの max_connections を用いる（pooler 多重化分は過小評価しうる旨を runbook に明記）。
	private resolveMax(serverMax: number): number {
		const override = process.env.DB_POOL_MAX_CONNECTIONS;
		if (typeof override === 'string' && override.trim().length > 0) {
			const parsed = Number(override);
			if (Number.isFinite(parsed) && parsed > 0) {
				return parsed;
			}
		}
		return serverMax;
	}

	// Interceptor 群と同じく AppLogger とは独立した 1 行 JSON を stdout へ発出する。
	private safeEmit(payload: DbPoolUtilizationPayload): void {
		try {
			console.log(JSON.stringify(payload));
		} catch {
			// 発出失敗は握り潰す
		}
	}
}

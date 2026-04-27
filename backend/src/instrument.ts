import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { createScrubber } from './common/sentry/sentry-scrubber';
import { applyStandardTags } from './common/sentry/sentry-tags';
import { SENTRY_ENV_KEYS } from './common/sentry/sentry-env-keys';

const scrubber = createScrubber();

// 429 非該当の 4xx クラスはノイズとして除外する。各エントリには除外理由を必ず添える。
const IGNORED_ERROR_NAMES: ReadonlyArray<string> = [
	// 404: 未マッチルート（ボット / typo / 古いリンク）が大量に流入し signal/noise を悪化させる
	'NotFoundException',
	// 400: ValidationPipe による入力エラーが大半でクライアント由来。アプリ起因ではない
	'BadRequestException',
	// 401: 認証失敗は ALB / プローブ / トークン期限切れで頻発しアラート対象として弱い
	'UnauthorizedException',
	// 403: 権限不足は意図したアクセス制御の結果なのでアラートではなく監査ログで追う
	'ForbiddenException',
	// NOTE: 429 (ThrottlerException) は意図的に除外しない。レート制限到達は調査価値があるため通報する
];

function resolveEnvironment(): 'development' | 'production' {
	const explicit = process.env[SENTRY_ENV_KEYS.ENVIRONMENT];
	if (explicit === 'production' || explicit === 'development') {
		return explicit;
	}
	return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

function parseSampleRate(raw: string | undefined, fallback: number): number {
	if (raw === undefined || raw.length === 0) {
		return fallback;
	}
	const parsed = Number.parseFloat(raw);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function initializeSentry(): void {
	const dsn = process.env[SENTRY_ENV_KEYS.DSN];
	if (!dsn) {
		console.log('Sentry disabled: SENTRY_DSN not set');
		return;
	}

	const environment = resolveEnvironment();
	const defaultSampleRate = environment === 'production' ? 0.1 : 0;
	const release = process.env[SENTRY_ENV_KEYS.RELEASE];

	const initOptions: Record<string, unknown> = {
		dsn,
		environment,
		sampleRate: 1.0,
		tracesSampleRate: parseSampleRate(
			process.env[SENTRY_ENV_KEYS.TRACES_SAMPLE_RATE],
			defaultSampleRate,
		),
		profilesSampleRate: parseSampleRate(
			process.env[SENTRY_ENV_KEYS.PROFILES_SAMPLE_RATE],
			defaultSampleRate,
		),
		sendDefaultPii: false,
		integrations: [nodeProfilingIntegration()],
		ignoreErrors: [...IGNORED_ERROR_NAMES],
		beforeSend(event: Record<string, unknown>) {
			try {
				const scrubbed = scrubber.scrub(event);
				const tagged = applyStandardTags(scrubbed);
				const existingTags = (scrubbed.tags ?? {}) as Record<string, unknown>;
				return {
					...scrubbed,
					tags: { ...existingTags, ...tagged.tags },
				};
			} catch {
				// 安全側フォールバック: scrub / tagging が壊れた event はそもそも送らない
				return null;
			}
		},
	};

	if (release && release.length > 0) {
		initOptions.release = release;
	}

	try {
		Sentry.init(initOptions);
	} catch (error) {
		// Observability は correctness を妨げない。SDK 起動失敗は warn だけ残してアプリ起動継続
		console.warn('Sentry.init failed; continuing without Sentry', error);
	}
}

initializeSentry();

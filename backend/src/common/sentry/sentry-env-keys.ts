/**
 * Sentry が参照する process.env キーの単一の真実の源泉。
 * `instrument.ts`（Nest コンテキスト生成前）と `ConfigService`（アプリ層）が
 * 同じ env を参照することを担保する。
 */
export const SENTRY_ENV_KEYS = {
	DSN: 'SENTRY_DSN',
	ENVIRONMENT: 'SENTRY_ENVIRONMENT',
	RELEASE: 'SENTRY_RELEASE',
	TRACES_SAMPLE_RATE: 'SENTRY_TRACES_SAMPLE_RATE',
	PROFILES_SAMPLE_RATE: 'SENTRY_PROFILES_SAMPLE_RATE',
	// Production smoke test 用に GET /debug-sentry を一時的に有効化するフラグ。
	// "true" 文字列のときのみ debug endpoint が稼働し、それ以外は 404 を返す。
	DEBUG_ENABLED: 'SENTRY_DEBUG_ENABLED',
} as const;

export type SentryEnvKey = (typeof SENTRY_ENV_KEYS)[keyof typeof SENTRY_ENV_KEYS];

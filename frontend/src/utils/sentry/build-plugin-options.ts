/**
 * @sentry/vite-plugin に渡すオプションを生成する純関数。
 *
 * Build 時の env から org / project / authToken / release を組み立て、
 * `disable: !SENTRY_AUTH_TOKEN` でローカルビルドや PR プレビューを自動無効化する。
 * vite.config.ts と単体テストの双方から参照される。
 */

export interface SentryVitePluginEnv {
	SENTRY_ORG?: string;
	SENTRY_PROJECT?: string;
	SENTRY_AUTH_TOKEN?: string;
	VITE_SENTRY_RELEASE?: string;
}

export interface SentryVitePluginOptions {
	org?: string;
	project?: string;
	authToken?: string;
	release: { name?: string };
	sourcemaps: { filesToDeleteAfterUpload: string[] };
	disable: boolean;
}

export function buildSentryVitePluginOptions(env: SentryVitePluginEnv): SentryVitePluginOptions {
	return {
		org: env.SENTRY_ORG,
		project: env.SENTRY_PROJECT,
		authToken: env.SENTRY_AUTH_TOKEN,
		release: { name: env.VITE_SENTRY_RELEASE },
		sourcemaps: {
			filesToDeleteAfterUpload: ['**/*.js.map'],
		},
		// auth token 不在 = ローカル / PR プレビュー / Secret 未投入の CI。Sentry に upload せず通り抜ける
		disable: !env.SENTRY_AUTH_TOKEN,
	};
}

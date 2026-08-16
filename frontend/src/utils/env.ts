/**
 * 環境変数の検証と取得を行うユーティリティ
 */

import { logger } from './logger';

export type SentryEnvironment = 'development' | 'production';

interface EnvConfig {
	// バックエンドURL
	backendUrl: string;
	// アプリケーションURL
	appUrl: string;
	// Supabase設定
	supabaseUrl: string;
	supabaseAnonKey: string;
	// OAuth Client ID（オプショナル - 使用する場合のみ設定）
	googleClientId?: string;
	xConsumerKey?: string;
	// Sentry 関連（オプショナル - DSN を起点に有効化される）
	sentryDsn?: string;
	sentryEnvironment?: SentryEnvironment;
	sentryRelease?: string;
	sentryTracesSampleRate?: number;
}

class EnvironmentValidator {
	private static instance: EnvironmentValidator;
	private config: EnvConfig | null = null;

	private constructor() {
		// プライベートコンストラクタでシングルトンを保証
	}

	static getInstance(): EnvironmentValidator {
		if (!EnvironmentValidator.instance) {
			EnvironmentValidator.instance = new EnvironmentValidator();
		}
		return EnvironmentValidator.instance;
	}

	/**
	 * 必須の環境変数を検証して取得
	 */
	private getRequiredEnv(key: string, envVarName: string): string {
		const value = import.meta.env[envVarName];
		if (!value) {
			throw new Error(`${key} is not configured. Please set ${envVarName} environment variable.`);
		}
		return value;
	}

	/**
	 * オプショナルな環境変数を取得
	 */
	private getOptionalEnv(envVarName: string): string | undefined {
		return import.meta.env[envVarName] || undefined;
	}

	/**
	 * Sentry environment を型安全に解決する。DSN ありで未指定なら production に fallback。
	 */
	private resolveSentryEnvironment(
		raw: string | undefined,
		dsn: string | undefined,
	): SentryEnvironment | undefined {
		if (!raw) {
			return dsn ? 'production' : undefined;
		}
		if (raw !== 'development' && raw !== 'production') {
			throw new Error(
				`Sentry Environment must be "development" or "production" (received "${raw}"). Please set VITE_SENTRY_ENVIRONMENT.`,
			);
		}
		return raw;
	}

	/**
	 * Sentry traces sample rate を数値として安全に解決する。
	 */
	private resolveSentryTracesSampleRate(raw: string | undefined): number | undefined {
		if (!raw) {
			return undefined;
		}
		const parsed = Number.parseFloat(raw);
		if (!Number.isFinite(parsed)) {
			throw new Error(
				`Sentry Traces Sample Rate must be a finite number (received "${raw}"). Please set VITE_SENTRY_TRACES_SAMPLE_RATE.`,
			);
		}
		return parsed;
	}

	/**
	 * 環境変数を検証して設定オブジェクトを初期化
	 */
	validate(): EnvConfig {
		if (this.config) {
			return this.config;
		}

		try {
			const sentryDsn = this.getOptionalEnv('VITE_SENTRY_DSN');
			const sentryEnvironment = this.resolveSentryEnvironment(
				this.getOptionalEnv('VITE_SENTRY_ENVIRONMENT'),
				sentryDsn,
			);
			const sentryTracesSampleRate = this.resolveSentryTracesSampleRate(
				this.getOptionalEnv('VITE_SENTRY_TRACES_SAMPLE_RATE'),
			);

			this.config = {
				// 必須の環境変数
				backendUrl: this.getRequiredEnv('Backend URL', 'VITE_BACKEND_URL'),
				appUrl: this.getRequiredEnv('App URL', 'VITE_APP_URL'),
				supabaseUrl: this.getRequiredEnv('Supabase URL', 'VITE_SUPABASE_URL'),
				supabaseAnonKey: this.getRequiredEnv('Supabase Anon Key', 'VITE_SUPABASE_ANON_KEY'),
				// オプショナルな環境変数（OAuth）
				googleClientId: this.getOptionalEnv('VITE_GOOGLE_CLIENT_ID'),
				xConsumerKey: this.getOptionalEnv('VITE_X_CONSUMER_KEY'),
				// Sentry 関連
				sentryDsn,
				sentryEnvironment,
				sentryRelease: this.getOptionalEnv('VITE_SENTRY_RELEASE'),
				sentryTracesSampleRate,
			};

			// 開発環境でのデバッグログ
			if (import.meta.env.DEV) {
				logger.debug('Environment configuration loaded:', {
					backendUrl: this.config.backendUrl,
					appUrl: this.config.appUrl,
					supabaseUrl: this.config.supabaseUrl,
					hasGoogleClientId: !!this.config.googleClientId,
					hasXConsumerKey: !!this.config.xConsumerKey,
					hasSentryDsn: !!this.config.sentryDsn,
					sentryEnvironment: this.config.sentryEnvironment,
				});
			}

			return this.config;
		} catch (error) {
			// 環境変数エラーをユーザーフレンドリーな形で表示
			const message =
				error instanceof Error ? error.message : 'Failed to load environment configuration';

			// 開発環境ではエラーログも出力
			if (import.meta.env.DEV) {
				logger.error('Environment validation failed:', error);
			}

			// エラーを再スロー（アプリケーション起動を中止）
			throw new Error(`Environment Configuration Error: ${message}`);
		}
	}

	/**
	 * 検証済みの設定を取得
	 */
	getConfig(): EnvConfig {
		if (!this.config) {
			return this.validate();
		}
		return this.config;
	}

	/**
	 * テスト用にキャッシュをクリアする。プロダクションコードからは呼ばないこと。
	 */
	reset(): void {
		this.config = null;
	}
}

// シングルトンインスタンスをエクスポート
export const envValidator = EnvironmentValidator.getInstance();

// 便利な関数としてもエクスポート
export function getEnvConfig(): EnvConfig {
	return envValidator.getConfig();
}

// 個別の環境変数取得用のヘルパー関数
export function getBackendUrl(): string {
	return envValidator.getConfig().backendUrl;
}

export function getAppUrl(): string {
	return envValidator.getConfig().appUrl;
}

export function getSupabaseConfig() {
	const config = envValidator.getConfig();
	return {
		url: config.supabaseUrl,
		anonKey: config.supabaseAnonKey,
	};
}

export function getGoogleClientId(): string {
	const config = envValidator.getConfig();
	if (!config.googleClientId) {
		throw new Error('Google Client ID is not configured');
	}
	return config.googleClientId;
}

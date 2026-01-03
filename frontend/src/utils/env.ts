/**
 * 環境変数の検証と取得を行うユーティリティ
 */

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
	githubClientId?: string;
	xConsumerKey?: string;
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
	 * 環境変数を検証して設定オブジェクトを初期化
	 */
	validate(): EnvConfig {
		if (this.config) {
			return this.config;
		}

		try {
			this.config = {
				// 必須の環境変数
				backendUrl: this.getRequiredEnv('Backend URL', 'VITE_BACKEND_URL'),
				appUrl: this.getRequiredEnv('App URL', 'VITE_APP_URL'),
				supabaseUrl: this.getRequiredEnv('Supabase URL', 'VITE_SUPABASE_URL'),
				supabaseAnonKey: this.getRequiredEnv('Supabase Anon Key', 'VITE_SUPABASE_ANON_KEY'),
				// オプショナルな環境変数（OAuth）
				googleClientId: this.getOptionalEnv('VITE_GOOGLE_CLIENT_ID'),
				githubClientId: this.getOptionalEnv('VITE_GITHUB_CLIENT_ID'),
				xConsumerKey: this.getOptionalEnv('VITE_X_CONSUMER_KEY'),
			};

			// 開発環境でのデバッグログ
			if (import.meta.env.DEV) {
				console.log('Environment configuration loaded:', {
					backendUrl: this.config.backendUrl,
					appUrl: this.config.appUrl,
					supabaseUrl: this.config.supabaseUrl,
					hasGoogleClientId: !!this.config.googleClientId,
					hasGithubClientId: !!this.config.githubClientId,
					hasXConsumerKey: !!this.config.xConsumerKey,
				});
			}

			return this.config;
		} catch (error) {
			// 環境変数エラーをユーザーフレンドリーな形で表示
			const message =
				error instanceof Error ? error.message : 'Failed to load environment configuration';

			// 開発環境ではconsole.errorも出力
			if (import.meta.env.DEV) {
				console.error('Environment validation failed:', error);
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

export function getGithubClientId(): string {
	const config = envValidator.getConfig();
	if (!config.githubClientId) {
		throw new Error('GitHub Client ID is not configured');
	}
	return config.githubClientId;
}

export function getXConsumerKey(): string {
	const config = envValidator.getConfig();
	if (!config.xConsumerKey) {
		throw new Error('X Consumer Key is not configured');
	}
	return config.xConsumerKey;
}

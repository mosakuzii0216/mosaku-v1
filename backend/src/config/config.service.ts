import { Injectable } from '@nestjs/common';
import { SENTRY_ENV_KEYS } from '../common/sentry/sentry-env-keys';

export interface SentryConfig {
	readonly dsn?: string;
	readonly environment: 'development' | 'production';
	readonly release?: string;
	readonly tracesSampleRate: number;
	readonly profilesSampleRate: number;
	readonly debugEnabled: boolean;
}

/**
 * Refresh Token Cookie 属性。`RefreshCookieHelper` から参照される単一の真実の源泉。
 */
export interface RefreshCookieOptions {
	readonly domain?: string;
	readonly sameSite: 'lax' | 'none' | 'strict';
	readonly secure: boolean;
	readonly path: '/auth';
}

const VALID_SAME_SITE_VALUES: ReadonlySet<RefreshCookieOptions['sameSite']> = new Set([
	'lax',
	'none',
	'strict',
]);

@Injectable()
export class ConfigService {
	// JWT設定
	get jwtSecret(): string {
		const secret = process.env.JWT_SECRET;
		if (!secret) {
			throw new Error('JWT_SECRET is not configured. Please set JWT_SECRET environment variable.');
		}
		return secret;
	}

	// 管理者設定
	get adminEmail(): string | undefined {
		return process.env.ADMIN_EMAIL;
	}

	isAdminEmail(email?: string): boolean {
		return email ? email === this.adminEmail : false;
	}

	// フロントエンド設定
	get frontendUrl(): string {
		return process.env.FRONTEND_URL || 'http://localhost';
	}

	// CORS設定
	get corsOrigins(): string[] {
		const origins = process.env.CORS_ORIGINS;
		if (!origins) {
			// デフォルトはローカル開発環境のみ
			return ['http://localhost:5173', 'http://localhost:80', 'http://localhost'];
		}
		// カンマ区切りで複数のoriginを設定可能
		return origins.split(',').map((origin) => origin.trim());
	}

	// 環境判定
	get isProduction(): boolean {
		return process.env.NODE_ENV === 'production';
	}

	get isDevelopment(): boolean {
		return process.env.NODE_ENV !== 'production';
	}

	// セッション設定
	get sessionSecret(): string {
		const secret = process.env.SESSION_SECRET;
		if (!secret) {
			throw new Error(
				'SESSION_SECRET is not configured. Please set SESSION_SECRET environment variable.',
			);
		}
		return secret;
	}

	// サーバー設定
	get port(): number {
		return parseInt(process.env.PORT || '3000', 10);
	}

	// OAuth Google設定
	get googleClientId(): string | undefined {
		return process.env.GOOGLE_CLIENT_ID;
	}

	get googleClientSecret(): string | undefined {
		return process.env.GOOGLE_CLIENT_SECRET;
	}

	get googleRedirectUri(): string {
		return process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';
	}

	// OAuth GitHub設定
	get githubClientId(): string | undefined {
		return process.env.GITHUB_CLIENT_ID;
	}

	get githubClientSecret(): string | undefined {
		return process.env.GITHUB_CLIENT_SECRET;
	}

	get githubRedirectUri(): string {
		return process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/auth/github/callback';
	}

	// OAuth LINE設定
	get lineClientId(): string | undefined {
		return process.env.LINE_CLIENT_ID;
	}

	get lineClientSecret(): string | undefined {
		return process.env.LINE_CLIENT_SECRET;
	}

	get lineRedirectUri(): string {
		return process.env.LINE_REDIRECT_URI || 'http://localhost:3000/auth/line/callback';
	}

	// OAuth Apple設定
	get appleClientId(): string | undefined {
		return process.env.APPLE_CLIENT_ID;
	}

	get appleTeamId(): string | undefined {
		return process.env.APPLE_TEAM_ID;
	}

	get appleKeyId(): string | undefined {
		return process.env.APPLE_KEY_ID;
	}

	get applePrivateKey(): string | undefined {
		const key = process.env.APPLE_PRIVATE_KEY;
		if (!key) return undefined;
		return key.replace(/\\n/g, '\n');
	}

	get appleRedirectUri(): string {
		return process.env.APPLE_REDIRECT_URI || 'http://localhost:3000/auth/apple/callback';
	}

	// OAuth X設定
	get xClientId(): string | undefined {
		return process.env.X_CLIENT_ID;
	}

	get xClientSecret(): string | undefined {
		return process.env.X_CLIENT_SECRET;
	}

	get xRedirectUri(): string {
		return process.env.X_REDIRECT_URI || 'http://localhost:3000/auth/x/callback';
	}

	// Refresh Token 設定
	/**
	 * Refresh Token のハッシュ用 pepper。
	 * 本番環境で未設定なら fail-fast（design.md §RefreshTokenService Risks）。
	 * 開発環境では未設定許容（空文字を返す）— ローカルで JWT_SECRET 互換の挙動。
	 */
	get refreshTokenPepper(): string {
		const pepper = process.env.REFRESH_TOKEN_PEPPER;
		if (!pepper) {
			if (this.isProduction) {
				throw new Error(
					'REFRESH_TOKEN_PEPPER is not configured. Refresh Token の発行には pepper の設定が必須です（本番環境）。',
				);
			}
			return '';
		}
		return pepper;
	}

	/**
	 * Refresh Token Cookie 属性。env で全て上書き可能。
	 * 既定: 本番は secure=true、それ以外は secure=false。SameSite は lax 既定でクロスドメイン構成時のみ `none` 上書き。
	 */
	get refreshCookieOptions(): RefreshCookieOptions {
		const rawSameSite = process.env.REFRESH_COOKIE_SAMESITE?.toLowerCase();
		const sameSite: RefreshCookieOptions['sameSite'] = VALID_SAME_SITE_VALUES.has(
			rawSameSite as RefreshCookieOptions['sameSite'],
		)
			? (rawSameSite as RefreshCookieOptions['sameSite'])
			: 'lax';

		const rawSecure = process.env.REFRESH_COOKIE_SECURE?.toLowerCase();
		const secure = rawSecure === 'true' ? true : rawSecure === 'false' ? false : this.isProduction;

		const domainRaw = process.env.REFRESH_COOKIE_DOMAIN;
		const domain = domainRaw && domainRaw.length > 0 ? domainRaw : undefined;

		return { sameSite, secure, domain, path: '/auth' };
	}

	// データベース設定
	get databaseUrl(): string {
		const url = process.env.DATABASE_URL;
		if (!url) {
			throw new Error('DATABASE_URL is not configured');
		}
		return url;
	}

	// URL生成ヘルパー
	generateSuccessRedirectUrl(accessToken: string, user: unknown): string {
		return `${this.frontendUrl}?token=${accessToken}&user=${encodeURIComponent(JSON.stringify(user))}`;
	}

	generateInvitationRequiredUrl(providerName: string, userData: unknown): string {
		return `${this.frontendUrl}?error=invitation_required&${providerName.toLowerCase()}_user=${encodeURIComponent(JSON.stringify(userData))}`;
	}

	generateAuthFailedUrl(): string {
		return `${this.frontendUrl}?error=auth_failed`;
	}

	// Sentry 設定
	get sentry(): SentryConfig {
		const environment = this.resolveSentryEnvironment();
		const defaultSampleRate = environment === 'production' ? 0.1 : 0;
		const release = process.env[SENTRY_ENV_KEYS.RELEASE];

		return {
			dsn: process.env[SENTRY_ENV_KEYS.DSN],
			environment,
			release: release && release.length > 0 ? release : undefined,
			tracesSampleRate: this.parseSampleRate(
				process.env[SENTRY_ENV_KEYS.TRACES_SAMPLE_RATE],
				defaultSampleRate,
			),
			profilesSampleRate: this.parseSampleRate(
				process.env[SENTRY_ENV_KEYS.PROFILES_SAMPLE_RATE],
				defaultSampleRate,
			),
			debugEnabled: process.env[SENTRY_ENV_KEYS.DEBUG_ENABLED] === 'true',
		};
	}

	private resolveSentryEnvironment(): 'development' | 'production' {
		const explicit = process.env[SENTRY_ENV_KEYS.ENVIRONMENT];
		if (explicit === 'production' || explicit === 'development') {
			return explicit;
		}
		return process.env.NODE_ENV === 'production' ? 'production' : 'development';
	}

	private parseSampleRate(raw: string | undefined, fallback: number): number {
		if (raw === undefined || raw.length === 0) {
			return fallback;
		}
		const parsed = Number.parseFloat(raw);
		return Number.isFinite(parsed) ? parsed : fallback;
	}
}

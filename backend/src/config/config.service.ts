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

/**
 * OAuth セッション Cookie（cookie-session）属性。`main.ts` のセッションミドルウェアが参照する。
 * X OAuth の CSRF state / PKCE code_verifier / 招待コードを格納する署名付き Cookie の構成。
 */
export interface SessionCookieOptions {
	readonly sameSite: 'lax' | 'none' | 'strict';
	readonly secure: boolean;
	readonly httpOnly: boolean;
	/** Cookie 有効期間（ミリ秒）。OAuth フロー完了に十分かつ過度に長くない範囲。 */
	readonly maxAge: number;
}

/** セッション Cookie 有効期間の既定値（10 分）。OAuth 往復に十分かつ過度に長くない。 */
const DEFAULT_SESSION_COOKIE_MAX_AGE = 1000 * 60 * 10;

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

	/**
	 * 招待 OAuth フロー（state 引き継ぎ）の HMAC 署名鍵。
	 * `JWT_SECRET` とは独立した鍵を要求し、`InvitationStateService` 専用に分離する。
	 * 未設定なら開発・本番を問わず fail-fast。
	 */
	get invitationStateSecret(): string {
		const secret = process.env.INVITATION_STATE_SECRET;
		if (!secret) {
			throw new Error(
				'INVITATION_STATE_SECRET is not configured. Please set INVITATION_STATE_SECRET environment variable (e.g. `openssl rand -hex 32`).',
			);
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

	// メール設定
	get resendApiKey(): string | undefined {
		const key = process.env.RESEND_API_KEY;
		return key && key.length > 0 ? key : undefined;
	}

	get mailFrom(): string {
		return process.env.MAIL_FROM || 'onboarding@resend.dev';
	}

	get passwordResetUrlBase(): string {
		const base = process.env.PASSWORD_RESET_URL_BASE;
		if (base && base.length > 0) {
			return base;
		}
		return `${this.frontendUrl}/auth/reset-password/confirm`;
	}

	// Slack Webhook 設定
	get slackFeedbackWebhookUrl(): string | undefined {
		const url = process.env.SLACK_FEEDBACK_WEBHOOK_URL;
		return url && url.length > 0 ? url : undefined;
	}

	// 環境判定
	get isProduction(): boolean {
		return process.env.NODE_ENV === 'production';
	}

	get isDevelopment(): boolean {
		return process.env.NODE_ENV !== 'production';
	}

	// セッション設定
	/**
	 * cookie-session の署名鍵。未設定なら本番・開発を問わず fail-fast。
	 *
	 * 【不変則】全 Cloud Run インスタンスで完全同一の単一値であること。
	 * これが多インスタンス耐性（Req 1.4 / 2.2）の前提。インスタンスごとに異なる値・
	 * 自動生成だと、ログイン開始とは別インスタンスに到達したコールバックで署名検証が
	 * サイレントに失敗し、session（state/verifier/招待コード）が解決できず durability が壊れる。
	 * Cloud Run の単一 env 注入で同一値は満たされる。ローテーション時は進行中フロー無効化を許容。
	 */
	get sessionSecret(): string {
		const secret = process.env.SESSION_SECRET;
		if (!secret) {
			throw new Error(
				'SESSION_SECRET is not configured. Please set SESSION_SECRET environment variable.',
			);
		}
		return secret;
	}

	/**
	 * OAuth セッション Cookie（cookie-session）属性。env で全て上書き可能。
	 * 既定: 本番は secure=true、それ以外は secure=false。httpOnly は常に true（XSS 対策）。
	 * sameSite は lax 既定でクロスオリジン構成時のみ `none` 上書き。maxAge 既定 10 分。
	 */
	get sessionCookieOptions(): SessionCookieOptions {
		const rawSameSite = process.env.SESSION_COOKIE_SAMESITE?.toLowerCase();
		const sameSite: SessionCookieOptions['sameSite'] = VALID_SAME_SITE_VALUES.has(
			rawSameSite as SessionCookieOptions['sameSite'],
		)
			? (rawSameSite as SessionCookieOptions['sameSite'])
			: 'lax';

		const rawSecure = process.env.SESSION_COOKIE_SECURE?.toLowerCase();
		const secure = rawSecure === 'true' ? true : rawSecure === 'false' ? false : this.isProduction;

		const rawMaxAge = Number(process.env.SESSION_COOKIE_MAXAGE);
		const maxAge =
			Number.isFinite(rawMaxAge) && rawMaxAge > 0 ? rawMaxAge : DEFAULT_SESSION_COOKIE_MAX_AGE;

		return { sameSite, secure, httpOnly: true, maxAge };
	}

	// サーバー設定
	get port(): number {
		return parseInt(process.env.PORT || '3000', 10);
	}

	/**
	 * backend 自身の公開 URL。OAuth コールバックや MCP canonical URI の組み立てに使う。
	 * 既定はローカル開発（`http://localhost:{PORT}`）。
	 */
	get backendUrl(): string {
		return process.env.BACKEND_URL || `http://localhost:${this.port}`;
	}

	/**
	 * MCP の canonical リソース URI（RFC 8707 の audience）。
	 * 発行トークンの `aud` と検証時の期待値に用いる単一の真実の源泉。
	 */
	get mcpCanonicalUrl(): string {
		return `${this.backendUrl.replace(/\/+$/, '')}/mcp`;
	}

	/**
	 * DNS rebinding 対策で許可する Host ヘッダ値の集合。
	 * BACKEND_URL のホストに加え、ローカル開発の host を許可する。
	 */
	get mcpAllowedHosts(): string[] {
		const hosts = new Set<string>([
			'localhost',
			`localhost:${this.port}`,
			'127.0.0.1',
			`127.0.0.1:${this.port}`,
		]);
		try {
			const host = new URL(this.backendUrl).host;
			if (host) {
				hosts.add(host);
			}
		} catch {
			// BACKEND_URL が不正な場合はローカル既定のみを許可
		}
		return [...hosts];
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

	generateAuthFailedUrl(): string {
		return `${this.frontendUrl}?error=auth_failed`;
	}

	/**
	 * OAuth state 検証失敗時のリダイレクト URL を組み立てる。
	 * 招待コード自体は URL path に乗るのみで Sentry イベント本文には含めない（PII 整合）。
	 */
	generateInvitationStateInvalidUrl(invitationCode: string): string {
		const base = this.frontendUrl.replace(/\/+$/, '');
		return `${base}/invite/${encodeURIComponent(invitationCode)}?error=invalid_state`;
	}

	/**
	 * X 招待登録の開始 URL（backend の register-start 経路）を state 付きで組み立てる。
	 * `startOAuthRegistration` で X プロバイダを選択した場合のみ使用する。
	 * ダミー PKCE を発行していた旧 `generateOAuthAuthorizationUrl('x')` の代替。
	 */
	generateXRegisterStartUrl(signedState: string): string {
		const base = this.backendUrl.replace(/\/+$/, '');
		return `${base}/auth/x/register-start?state=${signedState}`;
	}

	/**
	 * Google・GitHub・LINE・Apple の認可エンドポイント URL を state 付きで組み立てる。
	 * X は passport の PKCE/state 機構（`x.strategy.ts`）を使うため、
	 * X の招待登録開始は `generateXRegisterStartUrl` を使用すること。
	 */
	generateOAuthAuthorizationUrl(provider: string, state: string): string {
		switch (provider) {
			case 'google':
				return this.buildOAuthAuthorizationUrl('https://accounts.google.com/o/oauth2/v2/auth', {
					client_id: this.googleClientId ?? '',
					redirect_uri: this.googleRedirectUri,
					response_type: 'code',
					scope: 'email profile',
					state,
				});
			case 'github':
				return this.buildOAuthAuthorizationUrl('https://github.com/login/oauth/authorize', {
					client_id: this.githubClientId ?? '',
					redirect_uri: this.githubRedirectUri,
					scope: 'user:email',
					state,
				});
			case 'line':
				return this.buildOAuthAuthorizationUrl('https://access.line.me/oauth2/v2.1/authorize', {
					response_type: 'code',
					client_id: this.lineClientId ?? '',
					redirect_uri: this.lineRedirectUri,
					scope: 'profile openid',
					state,
				});
			case 'apple':
				return this.buildOAuthAuthorizationUrl('https://appleid.apple.com/auth/authorize', {
					client_id: this.appleClientId ?? '',
					redirect_uri: this.appleRedirectUri,
					response_type: 'code id_token',
					response_mode: 'form_post',
					scope: 'name email',
					state,
				});
			case 'x':
				throw new Error(
					'X OAuth は passport PKCE/state 方式を使用します。招待登録は generateXRegisterStartUrl() を使用してください。',
				);
			default:
				throw new Error(`Unsupported OAuth provider: ${provider}`);
		}
	}

	private buildOAuthAuthorizationUrl(base: string, params: Record<string, string>): string {
		const search = new URLSearchParams(params).toString();
		return `${base}?${search}`;
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

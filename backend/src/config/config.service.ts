import { Injectable } from '@nestjs/common';

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
		return process.env.VITE_APP_URL || 'http://localhost';
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
	get googleClientId(): string {
		const clientId = process.env.GOOGLE_CLIENT_ID;
		if (!clientId) {
			throw new Error('GOOGLE_CLIENT_ID is not configured');
		}
		return clientId;
	}

	get googleClientSecret(): string {
		const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
		if (!clientSecret) {
			throw new Error('GOOGLE_CLIENT_SECRET is not configured');
		}
		return clientSecret;
	}

	get googleRedirectUri(): string {
		const redirectUri = process.env.GOOGLE_REDIRECT_URI;
		if (!redirectUri) {
			throw new Error('GOOGLE_REDIRECT_URI is not configured');
		}
		return redirectUri;
	}

	// OAuth GitHub設定
	get githubClientId(): string {
		const clientId = process.env.GITHUB_CLIENT_ID;
		if (!clientId) {
			throw new Error('GITHUB_CLIENT_ID is not configured');
		}
		return clientId;
	}

	get githubClientSecret(): string {
		const clientSecret = process.env.GITHUB_CLIENT_SECRET;
		if (!clientSecret) {
			throw new Error('GITHUB_CLIENT_SECRET is not configured');
		}
		return clientSecret;
	}

	get githubRedirectUri(): string {
		const redirectUri = process.env.GITHUB_REDIRECT_URI;
		if (!redirectUri) {
			throw new Error('GITHUB_REDIRECT_URI is not configured');
		}
		return redirectUri;
	}

	// OAuth X設定
	get xConsumerKey(): string {
		const consumerKey = process.env.X_CONSUMER_KEY;
		if (!consumerKey) {
			throw new Error('X_CONSUMER_KEY is not configured');
		}
		return consumerKey;
	}

	get xConsumerSecret(): string {
		const consumerSecret = process.env.X_CONSUMER_SECRET;
		if (!consumerSecret) {
			throw new Error('X_CONSUMER_SECRET is not configured');
		}
		return consumerSecret;
	}

	get xRedirectUri(): string {
		const redirectUri = process.env.X_REDIRECT_URI;
		if (!redirectUri) {
			throw new Error('X_REDIRECT_URI is not configured');
		}
		return redirectUri;
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
	generateSuccessRedirectUrl(accessToken: string, user: any): string {
		return `${this.frontendUrl}?token=${accessToken}&user=${encodeURIComponent(JSON.stringify(user))}`;
	}

	generateInvitationRequiredUrl(providerName: string, userData: any): string {
		return `${this.frontendUrl}?error=invitation_required&${providerName.toLowerCase()}_user=${encodeURIComponent(JSON.stringify(userData))}`;
	}

	generateAuthFailedUrl(): string {
		return `${this.frontendUrl}?error=auth_failed`;
	}
}

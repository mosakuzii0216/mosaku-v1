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

	// OAuth Google設定 (Optional - defaults to placeholder if not configured)
	get googleClientId(): string {
		return process.env.GOOGLE_CLIENT_ID || 'not-configured';
	}

	get googleClientSecret(): string {
		return process.env.GOOGLE_CLIENT_SECRET || 'not-configured';
	}

	get googleRedirectUri(): string {
		return process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';
	}

	// OAuth GitHub設定 (Optional - defaults to placeholder if not configured)
	get githubClientId(): string {
		return process.env.GITHUB_CLIENT_ID || 'not-configured';
	}

	get githubClientSecret(): string {
		return process.env.GITHUB_CLIENT_SECRET || 'not-configured';
	}

	get githubRedirectUri(): string {
		return process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/auth/github/callback';
	}

	// OAuth X設定 (Disabled - X OAuth is not currently in use)
	get xConsumerKey(): string | undefined {
		return process.env.X_CONSUMER_KEY;
	}

	get xConsumerSecret(): string | undefined {
		return process.env.X_CONSUMER_SECRET;
	}

	get xRedirectUri(): string | undefined {
		return process.env.X_REDIRECT_URI;
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

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

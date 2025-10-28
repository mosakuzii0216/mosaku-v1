import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {
	// JWT設定
	get jwtSecret(): string {
		return process.env.JWT_SECRET || 'your-secret-key';
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

	// セッション設定
	get sessionSecret(): string {
		return process.env.SESSION_SECRET || 'your-session-secret-change-this-in-production';
	}

	// サーバー設定
	get port(): number {
		return parseInt(process.env.PORT || '3000', 10);
	}

	// OAuth Google設定
	get googleClientId(): string {
		return process.env.GOOGLE_CLIENT_ID!;
	}

	get googleClientSecret(): string {
		return process.env.GOOGLE_CLIENT_SECRET!;
	}

	get googleRedirectUri(): string {
		return process.env.GOOGLE_REDIRECT_URI!;
	}

	// OAuth GitHub設定
	get githubClientId(): string {
		return process.env.GITHUB_CLIENT_ID!;
	}

	get githubClientSecret(): string {
		return process.env.GITHUB_CLIENT_SECRET!;
	}

	get githubRedirectUri(): string {
		return process.env.GITHUB_REDIRECT_URI!;
	}

	// OAuth X設定
	get xConsumerKey(): string {
		return process.env.X_CONSUMER_KEY!;
	}

	get xConsumerSecret(): string {
		return process.env.X_CONSUMER_SECRET!;
	}

	get xRedirectUri(): string {
		return process.env.X_REDIRECT_URI!;
	}

	// データベース設定
	get databaseUrl(): string {
		return process.env.DATABASE_URL!;
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

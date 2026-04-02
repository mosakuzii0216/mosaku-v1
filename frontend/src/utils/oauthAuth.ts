import { getBackendUrl, getGoogleClientId, getGithubClientId } from './env';
import { BaseOAuthAuth } from './oauthAuth/BaseOAuthAuth';

class GoogleAuthUtilsClass extends BaseOAuthAuth {
	protected getProviderName(): string {
		return 'Google';
	}

	protected getUserParamName(): string {
		return 'google_user';
	}

	startAuth(): void {
		// 環境変数の検証は getGoogleClientId() 内で行われる
		getGoogleClientId(); // 環境変数が設定されているか検証
		const backendUrl = getBackendUrl();

		// バックエンドのGoogle認証エンドポイントにリダイレクト
		const googleAuthUrl = `${backendUrl}/auth/google`;
		window.location.href = googleAuthUrl;
	}
}

class GitHubAuthUtilsClass extends BaseOAuthAuth {
	protected getProviderName(): string {
		return 'GitHub';
	}

	protected getUserParamName(): string {
		return 'github_user';
	}

	startAuth(): void {
		// 環境変数の検証は getGithubClientId() 内で行われる
		getGithubClientId(); // 環境変数が設定されているか検証
		const backendUrl = getBackendUrl();

		// バックエンドのGitHub認証エンドポイントにリダイレクト
		const githubAuthUrl = `${backendUrl}/auth/github`;
		window.location.href = githubAuthUrl;
	}
}

// 静的メソッドとして公開するためのラッパー
const googleAuthUtils = new GoogleAuthUtilsClass();
const githubAuthUtils = new GitHubAuthUtilsClass();

export const GoogleAuthUtils = {
	startGoogleAuth: () => googleAuthUtils.startAuth(),
	parseAuthCallback: () => googleAuthUtils.parseAuthCallback(),
	clearAuthParams: () => googleAuthUtils.clearAuthParams(),
};

export const GitHubAuthUtils = {
	startGitHubAuth: () => githubAuthUtils.startAuth(),
	parseAuthCallback: () => githubAuthUtils.parseAuthCallback(),
	clearAuthParams: () => githubAuthUtils.clearAuthParams(),
};

class LineAuthUtilsClass extends BaseOAuthAuth {
	protected getProviderName(): string {
		return 'LINE';
	}

	protected getUserParamName(): string {
		return 'line_user';
	}

	startAuth(): void {
		window.location.href = `${getBackendUrl()}/auth/line`;
	}
}

class AppleAuthUtilsClass extends BaseOAuthAuth {
	protected getProviderName(): string {
		return 'Apple';
	}

	protected getUserParamName(): string {
		return 'apple_user';
	}

	startAuth(): void {
		window.location.href = `${getBackendUrl()}/auth/apple`;
	}
}

class XAuthUtilsClass extends BaseOAuthAuth {
	protected getProviderName(): string {
		return 'X';
	}

	protected getUserParamName(): string {
		return 'x_user';
	}

	startAuth(): void {
		window.location.href = `${getBackendUrl()}/auth/x`;
	}
}

const lineAuthUtils = new LineAuthUtilsClass();
const appleAuthUtils = new AppleAuthUtilsClass();
const xAuthUtils = new XAuthUtilsClass();

export const LineAuthUtils = {
	startLineAuth: () => lineAuthUtils.startAuth(),
	parseAuthCallback: () => lineAuthUtils.parseAuthCallback(),
	clearAuthParams: () => lineAuthUtils.clearAuthParams(),
};

export const AppleAuthUtils = {
	startAppleAuth: () => appleAuthUtils.startAuth(),
	parseAuthCallback: () => appleAuthUtils.parseAuthCallback(),
	clearAuthParams: () => appleAuthUtils.clearAuthParams(),
};

export const XAuthUtils = {
	startXAuth: () => xAuthUtils.startAuth(),
	parseAuthCallback: () => xAuthUtils.parseAuthCallback(),
	clearAuthParams: () => xAuthUtils.clearAuthParams(),
};

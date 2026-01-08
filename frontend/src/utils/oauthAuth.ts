import { getBackendUrl, getGoogleClientId, getGithubClientId, getXConsumerKey } from './env';
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

class XAuthUtilsClass extends BaseOAuthAuth {
	protected getProviderName(): string {
		return 'X';
	}

	protected getUserParamName(): string {
		return 'x_user';
	}

	startAuth(): void {
		// 環境変数の検証は getXConsumerKey() 内で行われる
		getXConsumerKey(); // 環境変数が設定されているか検証
		const backendUrl = getBackendUrl();

		// バックエンドのX認証エンドポイントにリダイレクト
		const xAuthUrl = `${backendUrl}/auth/x`;
		window.location.href = xAuthUrl;
	}
}

// 静的メソッドとして公開するためのラッパー
const googleAuthUtils = new GoogleAuthUtilsClass();
const githubAuthUtils = new GitHubAuthUtilsClass();
const xAuthUtils = new XAuthUtilsClass();

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

export const XAuthUtils = {
	startXAuth: () => xAuthUtils.startAuth(),
	parseAuthCallback: () => xAuthUtils.parseAuthCallback(),
	clearAuthParams: () => xAuthUtils.clearAuthParams(),
};

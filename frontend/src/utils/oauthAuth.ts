import type { UserProfile, OAuthUserData } from './auth';
import { getBackendUrl, getGoogleClientId, getGithubClientId, getXConsumerKey } from './env';
import { logger } from './logger';

export class GoogleAuthUtils {
	/**
	 * Google OAuth認証を開始する
	 */
	static startGoogleAuth(): void {
		// 環境変数の検証は getGoogleClientId() 内で行われる
		getGoogleClientId(); // 環境変数が設定されているか検証
		const backendUrl = getBackendUrl();

		// バックエンドのGoogle認証エンドポイントにリダイレクト
		const googleAuthUrl = `${backendUrl}/auth/google`;
		window.location.href = googleAuthUrl;
	}

	/**
	 * URLからGoogle認証の結果を解析する
	 */
	static parseAuthCallback(): {
		token?: string;
		user?: UserProfile;
		error?: string;
		googleUser?: OAuthUserData;
	} {
		const urlParams = new URLSearchParams(window.location.search);

		const token = urlParams.get('token');
		const userParam = urlParams.get('user');
		const error = urlParams.get('error');
		const googleUserParam = urlParams.get('google_user');

		// Google固有のパラメータがない場合は、Google認証ではないと判断
		if (!googleUserParam && error) {
			return {};
		}

		if (error) {
			let googleUser = undefined;
			if (googleUserParam) {
				try {
					googleUser = JSON.parse(decodeURIComponent(googleUserParam));
				} catch (parseError) {
					logger.error('Failed to parse google user data:', parseError);
				}
			}
			return { error, googleUser };
		}

		if (token && userParam) {
			try {
				const user = JSON.parse(decodeURIComponent(userParam));
				return { token, user };
			} catch (parseError) {
				logger.error('Failed to parse user data:', parseError);
				return { error: 'Failed to parse authentication data' };
			}
		}

		return {};
	}

	/**
	 * URLからGoogle認証パラメータをクリアする
	 */
	static clearAuthParams(): void {
		const url = new URL(window.location.href);
		url.searchParams.delete('token');
		url.searchParams.delete('user');
		url.searchParams.delete('error');
		url.searchParams.delete('google_user');

		// パラメータが変更された場合のみURLを更新
		if (url.search !== window.location.search) {
			window.history.replaceState({}, '', url.toString());
		}
	}
}

export class GitHubAuthUtils {
	/**
	 * GitHub OAuth認証を開始する
	 */
	static startGitHubAuth(): void {
		// 環境変数の検証は getGithubClientId() 内で行われる
		getGithubClientId(); // 環境変数が設定されているか検証
		const backendUrl = getBackendUrl();

		// バックエンドのGitHub認証エンドポイントにリダイレクト
		const githubAuthUrl = `${backendUrl}/auth/github`;
		window.location.href = githubAuthUrl;
	}

	/**
	 * URLからGitHub認証の結果を解析する
	 */
	static parseAuthCallback(): {
		token?: string;
		user?: UserProfile;
		error?: string;
		githubUser?: OAuthUserData;
	} {
		const urlParams = new URLSearchParams(window.location.search);

		const token = urlParams.get('token');
		const userParam = urlParams.get('user');
		const error = urlParams.get('error');
		const githubUserParam = urlParams.get('github_user');

		// GitHub固有のパラメータがない場合は、GitHub認証ではないと判断
		if (!githubUserParam && error) {
			return {};
		}

		if (error) {
			let githubUser = undefined;
			if (githubUserParam) {
				try {
					githubUser = JSON.parse(decodeURIComponent(githubUserParam));
				} catch (parseError) {
					logger.error('Failed to parse github user data:', parseError);
				}
			}
			return { error, githubUser };
		}

		if (token && userParam) {
			try {
				const user = JSON.parse(decodeURIComponent(userParam));
				return { token, user };
			} catch (parseError) {
				logger.error('Failed to parse user data:', parseError);
				return { error: 'Failed to parse authentication data' };
			}
		}

		return {};
	}

	/**
	 * URLからGitHub認証パラメータをクリアする
	 */
	static clearAuthParams(): void {
		const url = new URL(window.location.href);
		url.searchParams.delete('token');
		url.searchParams.delete('user');
		url.searchParams.delete('error');
		url.searchParams.delete('github_user');

		// パラメータが変更された場合のみURLを更新
		if (url.search !== window.location.search) {
			window.history.replaceState({}, '', url.toString());
		}
	}
}

export class XAuthUtils {
	/**
	 * X OAuth認証を開始する
	 */
	static startXAuth(): void {
		// 環境変数の検証は getXConsumerKey() 内で行われる
		getXConsumerKey(); // 環境変数が設定されているか検証
		const backendUrl = getBackendUrl();

		// バックエンドのX認証エンドポイントにリダイレクト
		const xAuthUrl = `${backendUrl}/auth/x`;
		window.location.href = xAuthUrl;
	}

	/**
	 * URLからX認証の結果を解析する
	 */
	static parseAuthCallback(): {
		token?: string;
		user?: UserProfile;
		error?: string;
		xUser?: OAuthUserData;
	} {
		const urlParams = new URLSearchParams(window.location.search);

		const token = urlParams.get('token');
		const userParam = urlParams.get('user');
		const error = urlParams.get('error');
		const xUserParam = urlParams.get('x_user');

		// X固有のパラメータがない場合は、X認証ではないと判断
		if (!xUserParam && error) {
			return {};
		}

		if (error) {
			let xUser = undefined;
			if (xUserParam) {
				try {
					xUser = JSON.parse(decodeURIComponent(xUserParam));
				} catch (parseError) {
					logger.error('Failed to parse x user data:', parseError);
				}
			}
			return { error, xUser };
		}

		if (token && userParam) {
			try {
				const user = JSON.parse(decodeURIComponent(userParam));
				return { token, user };
			} catch (parseError) {
				logger.error('Failed to parse user data:', parseError);
				return { error: 'Failed to parse authentication data' };
			}
		}

		return {};
	}

	/**
	 * URLからX認証パラメータをクリアする
	 */
	static clearAuthParams(): void {
		const url = new URL(window.location.href);
		url.searchParams.delete('token');
		url.searchParams.delete('user');
		url.searchParams.delete('error');
		url.searchParams.delete('x_user');

		// パラメータが変更された場合のみURLを更新
		if (url.search !== window.location.search) {
			window.history.replaceState({}, '', url.toString());
		}
	}
}

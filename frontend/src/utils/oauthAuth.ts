import { getBackendUrl, getGoogleClientId } from './env';
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

// 静的メソッドとして公開するためのラッパー
const googleAuthUtils = new GoogleAuthUtilsClass();

export const GoogleAuthUtils = {
	startGoogleAuth: () => googleAuthUtils.startAuth(),
	parseAuthCallback: () => googleAuthUtils.parseAuthCallback(),
	clearAuthParams: () => googleAuthUtils.clearAuthParams(),
};

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

const appleAuthUtils = new AppleAuthUtilsClass();
const xAuthUtils = new XAuthUtilsClass();

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

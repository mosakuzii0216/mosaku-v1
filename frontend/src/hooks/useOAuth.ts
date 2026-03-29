import { useCallback } from 'react';
import { AuthAPI, AuthTokenManager } from '../utils/auth';
import type { UserProfile, OAuthUserData } from '../utils/auth';
import { GoogleAuthUtils, GitHubAuthUtils } from '../utils/oauthAuth';
import { logger } from '../utils/logger';

export type OAuthProvider = 'google' | 'github';

interface OAuthProviderConfig {
	name: string;
	utils: typeof GoogleAuthUtils | typeof GitHubAuthUtils;
	storageKey: string;
	startAuth: () => void;
	registerWithInvitation: (
		user: OAuthUserData,
		code: string,
	) => Promise<{ accessToken: string; user: UserProfile }>;
	getUserData: (callback: Record<string, unknown>) => OAuthUserData | undefined;
}

// OAuthプロバイダの設定
export const OAUTH_PROVIDERS: Record<OAuthProvider, OAuthProviderConfig> = {
	google: {
		name: 'Google',
		utils: GoogleAuthUtils,
		storageKey: 'pendingGoogleUser',
		startAuth: GoogleAuthUtils.startGoogleAuth,
		registerWithInvitation: AuthAPI.googleRegisterWithInvitation,
		getUserData: (callback) => callback.googleUser as OAuthUserData | undefined,
	},
	github: {
		name: 'GitHub',
		utils: GitHubAuthUtils,
		storageKey: 'pendingGitHubUser',
		startAuth: GitHubAuthUtils.startGitHubAuth,
		registerWithInvitation: AuthAPI.githubRegisterWithInvitation,
		getUserData: (callback) => callback.githubUser as OAuthUserData | undefined,
	},
};

interface UseOAuthResult {
	startLogin: (provider: OAuthProvider) => void;
	registerWithInvitation: (
		provider: OAuthProvider,
		userData: OAuthUserData,
		invitationCode: string,
	) => Promise<{ accessToken: string; user: UserProfile }>;
	handleCallback: (
		onSuccess: (token: string, user: UserProfile) => void,
		onInvitationRequired: (provider: OAuthProvider, userData: OAuthUserData) => void,
	) => boolean;
}

/**
 * OAuth認証を管理するカスタムフック
 */
export const useOAuth = (): UseOAuthResult => {
	/**
	 * OAuth認証を開始
	 */
	const startLogin = useCallback((provider: OAuthProvider) => {
		try {
			OAUTH_PROVIDERS[provider].startAuth();
		} catch (error) {
			logger.error(`Failed to start ${OAUTH_PROVIDERS[provider].name} auth:`, error);
		}
	}, []);

	/**
	 * 招待コード付きでOAuth登録を完了
	 */
	const registerWithInvitation = useCallback(
		async (provider: OAuthProvider, userData: OAuthUserData, invitationCode: string) => {
			const config = OAUTH_PROVIDERS[provider];
			const response = await config.registerWithInvitation(userData, invitationCode);
			// 成功したらpending user情報をクリア
			sessionStorage.removeItem(config.storageKey);
			return response;
		},
		[],
	);

	/**
	 * OAuthコールバックを処理
	 * @returns コールバックが処理された場合はtrue
	 */
	const handleCallback = useCallback(
		(
			onSuccess: (token: string, user: UserProfile) => void,
			onInvitationRequired: (provider: OAuthProvider, userData: OAuthUserData) => void,
		): boolean => {
			for (const [providerKey, config] of Object.entries(OAUTH_PROVIDERS)) {
				const provider = providerKey as OAuthProvider;
				const authCallback = config.utils.parseAuthCallback();

				if (authCallback.error) {
					logger.error(`${config.name} auth error:`, authCallback.error);

					// 招待コードが必要な場合の処理
					if (authCallback.error === 'invitation_required') {
						const oauthUserData = config.getUserData(authCallback);
						if (oauthUserData) {
							sessionStorage.setItem(config.storageKey, JSON.stringify(oauthUserData));
							onInvitationRequired(provider, oauthUserData);
						}
					}

					config.utils.clearAuthParams();
					return true;
				}

				if (authCallback.token && authCallback.user) {
					// OAuth認証成功
					AuthTokenManager.setAccessToken(authCallback.token);
					onSuccess(authCallback.token, authCallback.user);
					config.utils.clearAuthParams();
					return true;
				}
			}

			return false;
		},
		[],
	);

	return {
		startLogin,
		registerWithInvitation,
		handleCallback,
	};
};

/**
 * セッションストレージからpending OAuthユーザーを取得
 */
export const getPendingOAuthUser = (provider: OAuthProvider): OAuthUserData | null => {
	const stored = sessionStorage.getItem(OAUTH_PROVIDERS[provider].storageKey);
	if (stored) {
		try {
			return JSON.parse(stored);
		} catch {
			return null;
		}
	}
	return null;
};

/**
 * pending OAuthユーザーをクリア
 */
export const clearPendingOAuthUser = (provider: OAuthProvider): void => {
	sessionStorage.removeItem(OAUTH_PROVIDERS[provider].storageKey);
};

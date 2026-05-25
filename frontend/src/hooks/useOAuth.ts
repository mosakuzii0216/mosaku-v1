import { useCallback } from 'react';
import { AuthTokenManager } from '../utils/auth';
import type { UserProfile } from '../utils/auth';
import {
	GoogleAuthUtils,
	GitHubAuthUtils,
	LineAuthUtils,
	AppleAuthUtils,
	XAuthUtils,
} from '../utils/oauthAuth';
import { logger } from '../utils/logger';

export type OAuthProvider = 'google' | 'github' | 'line' | 'apple' | 'x';

interface OAuthProviderConfig {
	name: string;
	utils:
		| typeof GoogleAuthUtils
		| typeof GitHubAuthUtils
		| typeof LineAuthUtils
		| typeof AppleAuthUtils
		| typeof XAuthUtils;
	startAuth: () => void;
}

// OAuthプロバイダの設定（既存ユーザー向けのログイン開始のみを扱う。
// 新規登録は `/invite/:code` → `/auth/oauth/:provider/start` 経由のみ）。
export const OAUTH_PROVIDERS: Record<OAuthProvider, OAuthProviderConfig> = {
	google: {
		name: 'Google',
		utils: GoogleAuthUtils,
		startAuth: GoogleAuthUtils.startGoogleAuth,
	},
	github: {
		name: 'GitHub',
		utils: GitHubAuthUtils,
		startAuth: GitHubAuthUtils.startGitHubAuth,
	},
	line: {
		name: 'LINE',
		utils: LineAuthUtils,
		startAuth: LineAuthUtils.startLineAuth,
	},
	apple: {
		name: 'Apple',
		utils: AppleAuthUtils,
		startAuth: AppleAuthUtils.startAppleAuth,
	},
	x: {
		name: 'X',
		utils: XAuthUtils,
		startAuth: XAuthUtils.startXAuth,
	},
};

interface UseOAuthResult {
	startLogin: (provider: OAuthProvider) => void;
	handleCallback: (onSuccess: (token: string, user: UserProfile) => void) => boolean;
}

/**
 * OAuth認証を管理するカスタムフック
 */
export const useOAuth = (): UseOAuthResult => {
	const startLogin = useCallback((provider: OAuthProvider) => {
		try {
			OAUTH_PROVIDERS[provider].startAuth();
		} catch (error) {
			logger.error(`Failed to start ${OAUTH_PROVIDERS[provider].name} auth:`, error);
		}
	}, []);

	/**
	 * OAuthコールバックを処理
	 * @returns コールバックが処理された場合はtrue
	 */
	const handleCallback = useCallback(
		(onSuccess: (token: string, user: UserProfile) => void): boolean => {
			for (const [, config] of Object.entries(OAUTH_PROVIDERS)) {
				const authCallback = config.utils.parseAuthCallback();

				if (authCallback.error) {
					logger.error(`${config.name} auth error:`, authCallback.error);
					config.utils.clearAuthParams();
					return true;
				}

				if (authCallback.token && authCallback.user) {
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
		handleCallback,
	};
};

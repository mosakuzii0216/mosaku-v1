import type { UserProfile, OAuthUserData } from '../auth';
import { logger } from '../logger';

/**
 * OAuth認証の基底クラス
 */
export abstract class BaseOAuthAuth {
	/**
	 * プロバイダー名を取得
	 */
	protected abstract getProviderName(): string;

	/**
	 * プロバイダー固有のユーザーパラメータ名を取得
	 */
	protected abstract getUserParamName(): string;

	/**
	 * OAuth認証を開始する
	 */
	abstract startAuth(): void;

	/**
	 * URLからOAuth認証の結果を解析する
	 */
	parseAuthCallback(): {
		token?: string;
		user?: UserProfile;
		error?: string;
		[key: string]: unknown; // プロバイダー固有のユーザーデータ
	} {
		const urlParams = new URLSearchParams(window.location.search);

		const token = urlParams.get('token');
		const userParam = urlParams.get('user');
		const error = urlParams.get('error');
		const providerUserParam = urlParams.get(this.getUserParamName());

		// プロバイダー固有のパラメータがない場合は、このプロバイダーの認証ではないと判断
		if (!providerUserParam && error) {
			return {};
		}

		if (error) {
			let providerUser: OAuthUserData | undefined = undefined;
			if (providerUserParam) {
				try {
					providerUser = JSON.parse(decodeURIComponent(providerUserParam));
				} catch (parseError) {
					logger.error(`Failed to parse ${this.getProviderName()} user data:`, parseError);
				}
			}
			// プロバイダー固有のキーで返す
			const result: Record<string, unknown> = { error };
			if (providerUser) {
				result[this.getUserParamName().replace('_user', 'User')] = providerUser;
			}
			return result;
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
	 * URLからOAuth認証パラメータをクリアする
	 */
	clearAuthParams(): void {
		const url = new URL(window.location.href);
		url.searchParams.delete('token');
		url.searchParams.delete('user');
		url.searchParams.delete('error');
		url.searchParams.delete(this.getUserParamName());

		// パラメータが変更された場合のみURLを更新
		if (url.search !== window.location.search) {
			window.history.replaceState({}, '', url.toString());
		}
	}
}

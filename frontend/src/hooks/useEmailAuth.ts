import { useCallback } from 'react';
import { AuthAPI, AuthTokenManager } from '../utils/auth';
import type { UserProfile } from '../utils/auth';
import { logger } from '../utils/logger';

interface UseEmailAuthResult {
	login: (email: string, password: string) => Promise<UserProfile>;
	register: (
		email: string,
		password: string,
		name?: string,
		invitationCode?: string,
	) => Promise<void>;
	resetPassword: (email: string) => Promise<void>;
	changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

/**
 * Email/Password認証を管理するカスタムフック
 */
export const useEmailAuth = (): UseEmailAuthResult => {
	/**
	 * メールアドレスとパスワードでログイン
	 */
	const login = useCallback(async (email: string, password: string): Promise<UserProfile> => {
		const response = await AuthAPI.login(email, password);
		return response.user;
	}, []);

	/**
	 * 新規ユーザー登録
	 */
	const register = useCallback(
		async (
			email: string,
			password: string,
			name?: string,
			invitationCode?: string,
		): Promise<void> => {
			await AuthAPI.register(email, password, name, invitationCode);
			// 登録成功、ユーザーはログインが必要
		},
		[],
	);

	/**
	 * パスワードリセットメール送信
	 */
	const resetPassword = useCallback(async (email: string): Promise<void> => {
		await AuthAPI.resetPassword(email);
	}, []);

	/**
	 * パスワード変更
	 */
	const changePassword = useCallback(
		async (currentPassword: string, newPassword: string): Promise<void> => {
			await AuthAPI.changePassword(currentPassword, newPassword);
		},
		[],
	);

	return {
		login,
		register,
		resetPassword,
		changePassword,
	};
};

/**
 * 認証状態を初期化（既存のJWTトークンを確認）
 */
export const initializeEmailAuth = async (): Promise<UserProfile | null> => {
	try {
		if (AuthTokenManager.isAuthenticated()) {
			return await AuthAPI.getCurrentUser();
		}
	} catch (error) {
		logger.error('Failed to initialize auth:', error);
		AuthTokenManager.removeTokens();
	}
	return null;
};

/**
 * ログアウト処理
 */
export const performLogout = async (): Promise<void> => {
	AuthTokenManager.removeTokens();

	try {
		await AuthAPI.logout();
	} catch (error) {
		logger.error('Logout error:', error);
		// エラーが発生してもローカル状態は既にクリアされているのでそのまま続行
	}
};

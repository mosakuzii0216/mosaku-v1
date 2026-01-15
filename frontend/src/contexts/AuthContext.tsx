/**
 * AuthContext - 認証状態管理
 *
 * 内部で以下のカスタムフックを使用して責務を分離:
 * - useEmailAuth: Email/Password認証
 * - useOAuth: OAuth認証（Google, GitHub, X）
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { AuthAPI, AuthTokenManager } from '../utils/auth';
import type { UserProfile, OAuthUserData } from '../utils/auth';
import { useEmailAuth, initializeEmailAuth, performLogout } from '../hooks/useEmailAuth';
import { useOAuth, type OAuthProvider } from '../hooks/useOAuth';
import { logger } from '../utils/logger';

// 状態の型定義
export interface AuthState {
	user: UserProfile | null;
	loading: boolean;
	isAuthenticated: boolean;
}

// アクションの型定義
export interface AuthActions {
	// Email認証
	login: (email: string, password: string) => Promise<void>;
	register: (email: string, password: string, name?: string, invitationCode?: string) => Promise<void>;
	resetPassword: (email: string) => Promise<void>;
	changePassword: (currentPassword: string, newPassword: string) => Promise<void>;

	// OAuth認証
	googleLogin: () => void;
	googleRegisterWithInvitation: (googleUser: OAuthUserData, invitationCode: string) => Promise<void>;
	githubLogin: () => void;
	githubRegisterWithInvitation: (githubUser: OAuthUserData, invitationCode: string) => Promise<void>;
	xLogin: () => void;
	xRegisterWithInvitation: (xUser: OAuthUserData, invitationCode: string) => Promise<void>;

	// 共通
	logout: () => Promise<void>;
	refreshUser: () => Promise<void>;
}

type AuthContextType = AuthState & AuthActions;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
	children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
	const [user, setUser] = useState<UserProfile | null>(null);
	const [loading, setLoading] = useState(true);

	// カスタムフックを使用
	const emailAuth = useEmailAuth();
	const oauth = useOAuth();

	// 認証成功時のハンドラー
	const handleAuthSuccess = useCallback((token: string, userProfile: UserProfile) => {
		AuthTokenManager.setAccessToken(token);
		setUser(userProfile);
	}, []);

	// 招待コードが必要な場合のハンドラー（現在は何もしない - UIで処理）
	const handleInvitationRequired = useCallback((_provider: OAuthProvider, _userData: OAuthUserData) => {
		// 招待コード入力フォームはAuthFormコンポーネントで処理
	}, []);

	// 初期化
	useEffect(() => {
		const initialize = async () => {
			try {
				// OAuthコールバックをチェック
				const oauthHandled = oauth.handleCallback(
					(token, userProfile) => handleAuthSuccess(token, userProfile),
					handleInvitationRequired,
				);

				if (oauthHandled) {
					setLoading(false);
					return;
				}

				// 既存のJWT認証をチェック
				const userProfile = await initializeEmailAuth();
				if (userProfile) {
					setUser(userProfile);
				}
			} catch (error) {
				logger.error('Failed to initialize auth:', error);
				AuthTokenManager.removeTokens();
			} finally {
				setLoading(false);
			}
		};

		initialize();
	}, [oauth, handleAuthSuccess, handleInvitationRequired]);

	// Email認証アクション
	const login = useCallback(
		async (email: string, password: string): Promise<void> => {
			const userProfile = await emailAuth.login(email, password);
			setUser(userProfile);
		},
		[emailAuth],
	);

	const register = useCallback(
		async (email: string, password: string, name?: string, invitationCode?: string): Promise<void> => {
			await emailAuth.register(email, password, name, invitationCode);
		},
		[emailAuth],
	);

	const resetPassword = useCallback(
		async (email: string): Promise<void> => {
			await emailAuth.resetPassword(email);
		},
		[emailAuth],
	);

	const changePassword = useCallback(
		async (currentPassword: string, newPassword: string): Promise<void> => {
			await emailAuth.changePassword(currentPassword, newPassword);
		},
		[emailAuth],
	);

	// ログアウト
	const logout = useCallback(async (): Promise<void> => {
		setUser(null);
		await performLogout();
	}, []);

	// ユーザー情報更新
	const refreshUser = useCallback(async (): Promise<void> => {
		try {
			if (AuthTokenManager.isAuthenticated()) {
				const userProfile = await AuthAPI.getCurrentUser();
				setUser(userProfile);
			}
		} catch (error) {
			logger.error('Failed to refresh user:', error);
			setUser(null);
			AuthTokenManager.removeTokens();
		}
	}, []);

	// OAuthアクション
	const googleLogin = useCallback(() => oauth.startLogin('google'), [oauth]);
	const githubLogin = useCallback(() => oauth.startLogin('github'), [oauth]);
	const xLogin = useCallback(() => oauth.startLogin('x'), [oauth]);

	const googleRegisterWithInvitation = useCallback(
		async (googleUser: OAuthUserData, invitationCode: string): Promise<void> => {
			const response = await oauth.registerWithInvitation('google', googleUser, invitationCode);
			handleAuthSuccess(response.accessToken, response.user);
		},
		[oauth, handleAuthSuccess],
	);

	const githubRegisterWithInvitation = useCallback(
		async (githubUser: OAuthUserData, invitationCode: string): Promise<void> => {
			const response = await oauth.registerWithInvitation('github', githubUser, invitationCode);
			handleAuthSuccess(response.accessToken, response.user);
		},
		[oauth, handleAuthSuccess],
	);

	const xRegisterWithInvitation = useCallback(
		async (xUser: OAuthUserData, invitationCode: string): Promise<void> => {
			const response = await oauth.registerWithInvitation('x', xUser, invitationCode);
			handleAuthSuccess(response.accessToken, response.user);
		},
		[oauth, handleAuthSuccess],
	);

	const value: AuthContextType = {
		// 状態
		user,
		loading,
		isAuthenticated: !!user && AuthTokenManager.isAuthenticated(),

		// Email認証
		login,
		register,
		resetPassword,
		changePassword,

		// OAuth認証
		googleLogin,
		googleRegisterWithInvitation,
		githubLogin,
		githubRegisterWithInvitation,
		xLogin,
		xRegisterWithInvitation,

		// 共通
		logout,
		refreshUser,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error('useAuth must be used within an AuthProvider');
	}
	return context;
};

// カスタムフックを再エクスポート
export { useOAuth, type OAuthProvider } from '../hooks/useOAuth';
export { useEmailAuth } from '../hooks/useEmailAuth';

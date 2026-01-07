import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { AuthAPI, AuthTokenManager } from '../utils/auth';
import type { UserProfile, OAuthUserData } from '../utils/auth';
import { GoogleAuthUtils, GitHubAuthUtils, XAuthUtils } from '../utils/oauthAuth';
import { logger } from '../utils/logger';

export interface AuthState {
	user: UserProfile | null;
	loading: boolean;
	isAuthenticated: boolean;
}

export interface AuthActions {
	login: (email: string, password: string) => Promise<void>;
	register: (
		email: string,
		password: string,
		name?: string,
		invitationCode?: string,
	) => Promise<void>;
	googleLogin: () => void;
	googleRegisterWithInvitation: (
		googleUser: OAuthUserData,
		invitationCode: string,
	) => Promise<void>;
	githubLogin: () => void;
	githubRegisterWithInvitation: (
		githubUser: OAuthUserData,
		invitationCode: string,
	) => Promise<void>;
	xLogin: () => void;
	xRegisterWithInvitation: (xUser: OAuthUserData, invitationCode: string) => Promise<void>;
	logout: () => Promise<void>;
	resetPassword: (email: string) => Promise<void>;
	changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
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

	useEffect(() => {
		initializeAuth();
	}, []);

	// OAuth providerの設定
	const oauthProviders = [
		{
			name: 'Google',
			utils: GoogleAuthUtils,
			storageKey: 'pendingGoogleUser',
			getUserData: (callback: ReturnType<typeof GoogleAuthUtils.parseAuthCallback>) => callback.googleUser,
		},
		{
			name: 'GitHub',
			utils: GitHubAuthUtils,
			storageKey: 'pendingGitHubUser',
			getUserData: (callback: ReturnType<typeof GitHubAuthUtils.parseAuthCallback>) => callback.githubUser,
		},
		{
			name: 'X',
			utils: XAuthUtils,
			storageKey: 'pendingXUser',
			getUserData: (callback: ReturnType<typeof XAuthUtils.parseAuthCallback>) => callback.xUser,
		},
	] as const;

	const handleOAuthCallback = (
		provider: typeof oauthProviders[number],
		callback: { token?: string; user?: UserProfile; error?: string },
		oauthUserData?: OAuthUserData,
	): boolean => {
		if (callback.error) {
			logger.error(`${provider.name} auth error:`, callback.error);

			// 招待コードが必要な場合の処理
			if (callback.error === 'invitation_required' && oauthUserData) {
				sessionStorage.setItem(provider.storageKey, JSON.stringify(oauthUserData));
			}
		} else if (callback.token && callback.user) {
			// OAuth認証成功
			AuthTokenManager.setAccessToken(callback.token);
			setUser(callback.user);
		}

		provider.utils.clearAuthParams();
		setLoading(false);
		return true;
	};

	const initializeAuth = async () => {
		try {
			// 各OAuth providerのコールバックをチェック
			for (const provider of oauthProviders) {
				const authCallback = provider.utils.parseAuthCallback();

				if (authCallback.error || (authCallback.token && authCallback.user)) {
					const oauthUserData = provider.getUserData(authCallback as any);
					handleOAuthCallback(provider, authCallback, oauthUserData);
					return;
				}
			}

			// 既存のJWT認証をチェック
			if (AuthTokenManager.isAuthenticated()) {
				const userProfile = await AuthAPI.getCurrentUser();
				setUser(userProfile);
			}
		} catch (error) {
			logger.error('Failed to initialize auth:', error);
			AuthTokenManager.removeTokens();
		} finally {
			setLoading(false);
		}
	};

	const login = async (email: string, password: string): Promise<void> => {
		const response = await AuthAPI.login(email, password);
		setUser(response.user);
	};

	const register = async (
		email: string,
		password: string,
		name?: string,
		invitationCode?: string,
	): Promise<void> => {
		await AuthAPI.register(email, password, name, invitationCode);
		// Registration successful, but user needs to login
	};

	const logout = async (): Promise<void> => {
		// 即座にローカル状態をクリア（UI更新を優先）
		setUser(null);
		AuthTokenManager.removeTokens();

		try {
			// バックエンドへのログアウト通知は非同期で実行
			await AuthAPI.logout();
		} catch (error) {
			logger.error('Logout error:', error);
			// エラーが発生してもローカル状態は既にクリアされているのでそのまま続行
		}
	};

	const resetPassword = async (email: string): Promise<void> => {
		await AuthAPI.resetPassword(email);
	};

	const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
		await AuthAPI.changePassword(currentPassword, newPassword);
	};

	const refreshUser = async (): Promise<void> => {
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
	};

	const googleLogin = (): void => {
		try {
			GoogleAuthUtils.startGoogleAuth();
		} catch (error) {
			logger.error('Failed to start Google auth:', error);
		}
	};

	const googleRegisterWithInvitation = async (
		googleUser: OAuthUserData,
		invitationCode: string,
	): Promise<void> => {
		const response = await AuthAPI.googleRegisterWithInvitation(googleUser, invitationCode);
		AuthTokenManager.setAccessToken(response.accessToken);
		setUser(response.user);
		// 成功したらpending user情報をクリア
		sessionStorage.removeItem('pendingGoogleUser');
	};

	const githubLogin = (): void => {
		try {
			GitHubAuthUtils.startGitHubAuth();
		} catch (error) {
			logger.error('Failed to start GitHub auth:', error);
		}
	};

	const githubRegisterWithInvitation = async (
		githubUser: OAuthUserData,
		invitationCode: string,
	): Promise<void> => {
		const response = await AuthAPI.githubRegisterWithInvitation(githubUser, invitationCode);
		AuthTokenManager.setAccessToken(response.accessToken);
		setUser(response.user);
		// 成功したらpending user情報をクリア
		sessionStorage.removeItem('pendingGitHubUser');
	};

	const xLogin = (): void => {
		try {
			XAuthUtils.startXAuth();
		} catch (error) {
			logger.error('Failed to start X auth:', error);
		}
	};

	const xRegisterWithInvitation = async (
		xUser: OAuthUserData,
		invitationCode: string,
	): Promise<void> => {
		const response = await AuthAPI.xRegisterWithInvitation(xUser, invitationCode);
		AuthTokenManager.setAccessToken(response.accessToken);
		setUser(response.user);
		// 成功したらpending user情報をクリア
		sessionStorage.removeItem('pendingXUser');
	};

	const value: AuthContextType = {
		user,
		loading,
		isAuthenticated: !!user && AuthTokenManager.isAuthenticated(),
		login,
		register,
		googleLogin,
		googleRegisterWithInvitation,
		githubLogin,
		githubRegisterWithInvitation,
		xLogin,
		xRegisterWithInvitation,
		logout,
		resetPassword,
		changePassword,
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

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { AuthAPI, AuthTokenManager } from '../utils/auth';
import type { UserProfile } from '../utils/auth';
import { useEmailAuth, initializeEmailAuth } from '../hooks/useEmailAuth';
import { useOAuth } from '../hooks/useOAuth';
import { useSentryAuthSync } from '../hooks/useSentryAuthSync';
import { refreshClient } from '../utils/refreshClient';
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
	resetPassword: (email: string) => Promise<void>;
	changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
	googleLogin: () => void;
	appleLogin: () => void;
	xLogin: () => void;
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

	const emailAuth = useEmailAuth();
	const oauth = useOAuth();

	// Sentry scope を user state に同期する（id のみ。email / provider は渡さない）
	useSentryAuthSync(user);

	const handleAuthSuccess = useCallback((token: string, userProfile: UserProfile) => {
		AuthTokenManager.setAccessToken(token);
		setUser(userProfile);
	}, []);

	const { handleCallback: oauthHandleCallback } = oauth;

	useEffect(() => {
		const initialize = async () => {
			try {
				// 1. OAuthコールバックをチェック
				const oauthHandled = oauthHandleCallback((token, userProfile) =>
					handleAuthSuccess(token, userProfile),
				);

				if (oauthHandled) {
					return;
				}

				// 2. Refresh Token 経由の自動セッション復元
				const refreshed = await refreshClient.tryAutoRefresh();
				if (refreshed) {
					setUser(refreshed.user);
					return;
				}

				// 3. 既存の localStorage 内 Access Token によるフォールバック
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
	}, [oauthHandleCallback, handleAuthSuccess]);

	const login = useCallback(
		async (email: string, password: string): Promise<void> => {
			const userProfile = await emailAuth.login(email, password);
			setUser(userProfile);
		},
		[emailAuth],
	);

	const register = useCallback(
		async (
			email: string,
			password: string,
			name?: string,
			invitationCode?: string,
		): Promise<void> => {
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

	const logout = useCallback(async (): Promise<void> => {
		setUser(null);
		await refreshClient.logout();
	}, []);

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

	const googleLogin = useCallback(() => oauth.startLogin('google'), [oauth]);
	const appleLogin = useCallback(() => oauth.startLogin('apple'), [oauth]);
	const xLogin = useCallback(() => oauth.startLogin('x'), [oauth]);

	const value: AuthContextType = {
		user,
		loading,
		isAuthenticated: !!user && AuthTokenManager.isAuthenticated(),
		login,
		register,
		resetPassword,
		changePassword,
		googleLogin,
		appleLogin,
		xLogin,
		logout,
		refreshUser,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextType => {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error('useAuth must be used within an AuthProvider');
	}
	return context;
};

// eslint-disable-next-line react-refresh/only-export-components
export { useOAuth, type OAuthProvider } from '../hooks/useOAuth';
// eslint-disable-next-line react-refresh/only-export-components
export { useEmailAuth } from '../hooks/useEmailAuth';

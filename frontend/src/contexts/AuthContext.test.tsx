import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';

const tryAutoRefreshMock = vi.fn();
const logoutMock = vi.fn();

vi.mock('../utils/refreshClient', () => ({
	refreshClient: {
		tryAutoRefresh: (...args: unknown[]) => tryAutoRefreshMock(...args),
		ensureRefreshed: vi.fn(),
		clearPendingRefresh: vi.fn(),
		logout: (...args: unknown[]) => logoutMock(...args),
	},
}));

const initializeEmailAuthMock = vi.fn();
const performLogoutMock = vi.fn();

vi.mock('../hooks/useEmailAuth', () => ({
	useEmailAuth: () => ({
		login: vi.fn(),
		register: vi.fn(),
		resetPassword: vi.fn(),
		changePassword: vi.fn(),
	}),
	initializeEmailAuth: (...args: unknown[]) => initializeEmailAuthMock(...args),
	performLogout: (...args: unknown[]) => performLogoutMock(...args),
}));

const handleCallbackMock = vi.fn();
const stableOAuthHandlers = {
	startLogin: vi.fn(),
	handleCallback: handleCallbackMock,
};

vi.mock('../hooks/useOAuth', () => ({
	useOAuth: () => stableOAuthHandlers,
}));

vi.mock('../hooks/useSentryAuthSync', () => ({
	useSentryAuthSync: vi.fn(),
}));

vi.mock('../utils/env', () => ({
	getBackendUrl: () => 'http://localhost:3000',
}));

vi.mock('../utils/auth', () => ({
	AuthTokenManager: {
		getAccessToken: vi.fn().mockReturnValue(null),
		setAccessToken: vi.fn(),
		removeTokens: vi.fn(),
		isAuthenticated: vi.fn().mockReturnValue(false),
		isTokenExpired: vi.fn().mockReturnValue(true),
		getTokenPayload: vi.fn(),
	},
	AuthAPI: {
		getCurrentUser: vi.fn(),
		logout: vi.fn(),
	},
}));

import { AuthTokenManager } from '../utils/auth';

const sampleUser = {
	id: 'user-1',
	email: 'e@example.com',
	name: 'User',
	role: 'USER' as const,
	createdAt: '',
	updatedAt: '',
};

function AuthProbe() {
	const auth = useAuth();
	return (
		<div>
			<span data-testid="loading">{auth.loading ? 'loading' : 'done'}</span>
			<span data-testid="user">{auth.user ? auth.user.id : 'none'}</span>
		</div>
	);
}

describe('AuthProvider initialization sequence', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		handleCallbackMock.mockReturnValue(false);
		tryAutoRefreshMock.mockResolvedValue(null);
		initializeEmailAuthMock.mockResolvedValue(null);
		vi.mocked(AuthTokenManager.isAuthenticated).mockReturnValue(false);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('OAuth callback がない場合 tryAutoRefresh を呼び、その結果で user を復元する', async () => {
		tryAutoRefreshMock.mockResolvedValueOnce({
			accessToken: 'restored-token',
			user: sampleUser,
		});

		render(
			<AuthProvider>
				<AuthProbe />
			</AuthProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId('loading').textContent).toBe('done');
		});

		expect(tryAutoRefreshMock).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('user').textContent).toBe(sampleUser.id);
		expect(initializeEmailAuthMock).not.toHaveBeenCalled();
	});

	it('tryAutoRefresh が null を返したら initializeEmailAuth にフォールバックする', async () => {
		tryAutoRefreshMock.mockResolvedValueOnce(null);
		initializeEmailAuthMock.mockResolvedValueOnce(sampleUser);

		render(
			<AuthProvider>
				<AuthProbe />
			</AuthProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId('loading').textContent).toBe('done');
		});

		expect(tryAutoRefreshMock).toHaveBeenCalledTimes(1);
		expect(initializeEmailAuthMock).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('user').textContent).toBe(sampleUser.id);
	});

	it('OAuth callback が handled の場合 tryAutoRefresh を呼ばない', async () => {
		handleCallbackMock.mockReturnValue(true);

		render(
			<AuthProvider>
				<AuthProbe />
			</AuthProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId('loading').textContent).toBe('done');
		});

		expect(tryAutoRefreshMock).not.toHaveBeenCalled();
		expect(initializeEmailAuthMock).not.toHaveBeenCalled();
	});

	it('tryAutoRefresh も initializeEmailAuth も失敗時は user=null、ログイン画面遷移可能', async () => {
		tryAutoRefreshMock.mockResolvedValueOnce(null);
		initializeEmailAuthMock.mockResolvedValueOnce(null);

		render(
			<AuthProvider>
				<AuthProbe />
			</AuthProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId('loading').textContent).toBe('done');
		});

		expect(screen.getByTestId('user').textContent).toBe('none');
	});

	it('初期化中は loading=true を維持する', async () => {
		let resolveRefresh!: (value: { accessToken: string; user: typeof sampleUser } | null) => void;
		tryAutoRefreshMock.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveRefresh = resolve;
			}),
		);

		render(
			<AuthProvider>
				<AuthProbe />
			</AuthProvider>,
		);

		expect(screen.getByTestId('loading').textContent).toBe('loading');

		resolveRefresh(null);
		await waitFor(() => {
			expect(screen.getByTestId('loading').textContent).toBe('done');
		});
	});
});

describe('AuthProvider logout flow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		handleCallbackMock.mockReturnValue(false);
		tryAutoRefreshMock.mockResolvedValueOnce({
			accessToken: 'restored-token',
			user: sampleUser,
		});
		logoutMock.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	function LogoutTrigger() {
		const auth = useAuth();
		React.useEffect(() => {
			if (auth.user && auth.user.id === sampleUser.id) {
				auth.logout();
			}
		}, [auth]);
		return (
			<div>
				<span data-testid="user">{auth.user ? auth.user.id : 'none'}</span>
			</div>
		);
	}

	it('logout() で refreshClient.logout を呼び user を null に戻す', async () => {
		render(
			<AuthProvider>
				<LogoutTrigger />
			</AuthProvider>,
		);

		await waitFor(() => {
			expect(logoutMock).toHaveBeenCalledTimes(1);
		});
		await waitFor(() => {
			expect(screen.getByTestId('user').textContent).toBe('none');
		});

		expect(performLogoutMock).not.toHaveBeenCalled();
	});
});

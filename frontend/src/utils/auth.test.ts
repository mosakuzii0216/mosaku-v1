import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('./env', () => ({
	getBackendUrl: () => 'http://localhost:3000',
}));

import { AuthAPI, AuthTokenManager } from './auth';

describe('AuthAPI.login()', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it('成功時に LoginResponse を返してアクセストークンを保存する', async () => {
		const mockData = {
			message: 'Login successful',
			accessToken: 'test-token-abc',
			user: {
				id: '1',
				email: 'test@example.com',
				name: 'Test',
				role: 'USER' as const,
				createdAt: '',
				updatedAt: '',
			},
		};
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockData),
			}),
		);

		const result = await AuthAPI.login('test@example.com', 'password');

		expect(result).toEqual(mockData);
		expect(AuthTokenManager.getAccessToken()).toBe('test-token-abc');
	});

	it('非 OK でサーバーの message を throw する', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({ message: '認証情報が正しくありません' }),
			}),
		);

		await expect(AuthAPI.login('test@example.com', 'wrong')).rejects.toThrow(
			'認証情報が正しくありません',
		);
	});

	it('JSON message がない場合は Login failed にフォールバックする', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({}),
			}),
		);

		await expect(AuthAPI.login('test@example.com', 'wrong')).rejects.toThrow('Login failed');
	});

	it('正しいエンドポイントを呼び出す', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({
				message: 'ok',
				accessToken: 'token',
				user: { id: '1', email: 'e', name: 'n', role: 'USER', createdAt: '', updatedAt: '' },
			}),
		});
		vi.stubGlobal('fetch', mockFetch);

		await AuthAPI.login('test@example.com', 'password');

		expect(mockFetch).toHaveBeenCalledWith(
			'http://localhost:3000/auth/login',
			expect.objectContaining({ method: 'POST' }),
		);
	});
});

describe('AuthAPI.register()', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it('成功時に RegisterResponse を返す', async () => {
		const mockData = {
			message: 'Registered',
			user: {
				id: '2',
				email: 'new@example.com',
				name: 'New User',
				role: 'USER' as const,
				createdAt: '',
				updatedAt: '',
			},
		};
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockData),
			}),
		);

		const result = await AuthAPI.register('new@example.com', 'password', 'New User');

		expect(result).toEqual(mockData);
	});

	it('非 OK で Registration failed エラーを throw する', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({}),
			}),
		);

		await expect(AuthAPI.register('e@e.com', 'pass')).rejects.toThrow('Registration failed');
	});

	it('正しいエンドポイントを呼び出す', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({
				message: 'ok',
				user: { id: '1', email: 'e', name: 'n', role: 'USER', createdAt: '', updatedAt: '' },
			}),
		});
		vi.stubGlobal('fetch', mockFetch);

		await AuthAPI.register('e@example.com', 'password');

		expect(mockFetch).toHaveBeenCalledWith(
			'http://localhost:3000/auth/register',
			expect.objectContaining({ method: 'POST' }),
		);
	});
});

describe('AuthAPI.resetPassword()', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it('成功時に message を返す', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ message: 'メールを送信しました' }),
			}),
		);

		const result = await AuthAPI.resetPassword('user@example.com');

		expect(result).toEqual({ message: 'メールを送信しました' });
	});

	it('非 OK で Failed to send password reset email を throw する', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({}),
			}),
		);

		await expect(AuthAPI.resetPassword('e@e.com')).rejects.toThrow(
			'Failed to send password reset email',
		);
	});

	it('正しいエンドポイントを呼び出す', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({ message: 'ok' }),
		});
		vi.stubGlobal('fetch', mockFetch);

		await AuthAPI.resetPassword('user@example.com');

		expect(mockFetch).toHaveBeenCalledWith(
			'http://localhost:3000/auth/reset-password',
			expect.objectContaining({ method: 'POST' }),
		);
	});
});

// ===== OAuth 招待登録フロー =====

const oauthUser = {
	name: 'Test User',
	email: 'test@example.com',
	picture: 'https://example.com/pic.jpg',
};
const mockLoginResponse = {
	message: 'Registered',
	accessToken: 'oauth-token-xyz',
	user: {
		id: '10',
		email: 'test@example.com',
		name: 'Test User',
		role: 'USER' as const,
		createdAt: '',
		updatedAt: '',
	},
};

function stubFetchSuccess() {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue(mockLoginResponse),
		}),
	);
}

function stubFetchFailure(body: Record<string, unknown> = {}) {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({
			ok: false,
			json: vi.fn().mockResolvedValue(body),
		}),
	);
}

describe('AuthAPI.googleRegisterWithInvitation()', () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it('成功時に LoginResponse を返しアクセストークンを保存する', async () => {
		stubFetchSuccess();
		const result = await AuthAPI.googleRegisterWithInvitation(oauthUser, 'INV-001');
		expect(result).toEqual(mockLoginResponse);
		expect(AuthTokenManager.getAccessToken()).toBe('oauth-token-xyz');
	});

	it('非 OK で Google registration failed を throw する', async () => {
		stubFetchFailure();
		await expect(AuthAPI.googleRegisterWithInvitation(oauthUser, 'INV-001')).rejects.toThrow(
			'Google registration failed',
		);
	});

	it('正しいエンドポイントを呼び出す', async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockLoginResponse) });
		vi.stubGlobal('fetch', mockFetch);
		await AuthAPI.googleRegisterWithInvitation(oauthUser, 'INV-001');
		expect(mockFetch).toHaveBeenCalledWith(
			'http://localhost:3000/auth/google/register-with-invitation',
			expect.objectContaining({ method: 'POST' }),
		);
	});
});

describe('AuthAPI.githubRegisterWithInvitation()', () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it('成功時に LoginResponse を返しアクセストークンを保存する', async () => {
		stubFetchSuccess();
		const result = await AuthAPI.githubRegisterWithInvitation(oauthUser, 'INV-001');
		expect(result).toEqual(mockLoginResponse);
		expect(AuthTokenManager.getAccessToken()).toBe('oauth-token-xyz');
	});

	it('非 OK で GitHub registration failed を throw する', async () => {
		stubFetchFailure();
		await expect(AuthAPI.githubRegisterWithInvitation(oauthUser, 'INV-001')).rejects.toThrow(
			'GitHub registration failed',
		);
	});

	it('正しいエンドポイントを呼び出す', async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockLoginResponse) });
		vi.stubGlobal('fetch', mockFetch);
		await AuthAPI.githubRegisterWithInvitation(oauthUser, 'INV-001');
		expect(mockFetch).toHaveBeenCalledWith(
			'http://localhost:3000/auth/github/register-with-invitation',
			expect.objectContaining({ method: 'POST' }),
		);
	});
});

describe('AuthAPI.lineRegisterWithInvitation()', () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it('成功時に LoginResponse を返しアクセストークンを保存する', async () => {
		stubFetchSuccess();
		const result = await AuthAPI.lineRegisterWithInvitation(oauthUser, 'INV-001');
		expect(result).toEqual(mockLoginResponse);
		expect(AuthTokenManager.getAccessToken()).toBe('oauth-token-xyz');
	});

	it('非 OK で LINE registration failed を throw する', async () => {
		stubFetchFailure();
		await expect(AuthAPI.lineRegisterWithInvitation(oauthUser, 'INV-001')).rejects.toThrow(
			'LINE registration failed',
		);
	});

	it('正しいエンドポイントを呼び出す', async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockLoginResponse) });
		vi.stubGlobal('fetch', mockFetch);
		await AuthAPI.lineRegisterWithInvitation(oauthUser, 'INV-001');
		expect(mockFetch).toHaveBeenCalledWith(
			'http://localhost:3000/auth/line/register-with-invitation',
			expect.objectContaining({ method: 'POST' }),
		);
	});
});

describe('AuthAPI.appleRegisterWithInvitation()', () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it('成功時に LoginResponse を返しアクセストークンを保存する', async () => {
		stubFetchSuccess();
		const result = await AuthAPI.appleRegisterWithInvitation(oauthUser, 'INV-001');
		expect(result).toEqual(mockLoginResponse);
		expect(AuthTokenManager.getAccessToken()).toBe('oauth-token-xyz');
	});

	it('fallbackEmail オプション引数を渡せる', async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockLoginResponse) });
		vi.stubGlobal('fetch', mockFetch);
		await AuthAPI.appleRegisterWithInvitation(oauthUser, 'INV-001', 'fallback@example.com');
		const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
		expect(body.fallbackEmail).toBe('fallback@example.com');
	});

	it('非 OK で Apple registration failed を throw する', async () => {
		stubFetchFailure();
		await expect(AuthAPI.appleRegisterWithInvitation(oauthUser, 'INV-001')).rejects.toThrow(
			'Apple registration failed',
		);
	});

	it('正しいエンドポイントを呼び出す', async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockLoginResponse) });
		vi.stubGlobal('fetch', mockFetch);
		await AuthAPI.appleRegisterWithInvitation(oauthUser, 'INV-001');
		expect(mockFetch).toHaveBeenCalledWith(
			'http://localhost:3000/auth/apple/register-with-invitation',
			expect.objectContaining({ method: 'POST' }),
		);
	});
});

describe('AuthAPI.xRegisterWithInvitation()', () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it('成功時に LoginResponse を返しアクセストークンを保存する', async () => {
		stubFetchSuccess();
		const result = await AuthAPI.xRegisterWithInvitation(oauthUser, 'INV-001');
		expect(result).toEqual(mockLoginResponse);
		expect(AuthTokenManager.getAccessToken()).toBe('oauth-token-xyz');
	});

	it('非 OK で X registration failed を throw する', async () => {
		stubFetchFailure();
		await expect(AuthAPI.xRegisterWithInvitation(oauthUser, 'INV-001')).rejects.toThrow(
			'X registration failed',
		);
	});

	it('正しいエンドポイントを呼び出す', async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockLoginResponse) });
		vi.stubGlobal('fetch', mockFetch);
		await AuthAPI.xRegisterWithInvitation(oauthUser, 'INV-001');
		expect(mockFetch).toHaveBeenCalledWith(
			'http://localhost:3000/auth/x/register-with-invitation',
			expect.objectContaining({ method: 'POST' }),
		);
	});
});

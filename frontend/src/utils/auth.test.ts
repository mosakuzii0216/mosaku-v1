import { describe, it, expect, vi, afterEach } from 'vitest';

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

// ===== Task 9.1: 旧 OAuth 招待登録 API は AuthAPI から削除済み =====

describe('AuthAPI 旧 OAuth 招待登録メソッドの撤去', () => {
	it.each([
		'googleRegisterWithInvitation',
		'githubRegisterWithInvitation',
		'lineRegisterWithInvitation',
		'appleRegisterWithInvitation',
		'xRegisterWithInvitation',
	])(
		'AuthAPI.%s は削除されている（新フローは apiClient.startOAuthRegistration を使う）',
		(method) => {
			expect((AuthAPI as unknown as Record<string, unknown>)[method]).toBeUndefined();
		},
	);
});

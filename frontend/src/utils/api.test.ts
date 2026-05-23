import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InvitationVerificationResponse } from '../types/invitation';

vi.mock('./env', () => ({
	getBackendUrl: () => 'http://localhost:3000',
}));

vi.mock('./auth', () => ({
	AuthTokenManager: {
		getAccessToken: vi.fn().mockReturnValue('mock-token'),
		isTokenExpired: vi.fn().mockReturnValue(false),
		setAccessToken: vi.fn(),
		removeTokens: vi.fn(),
	},
}));

const ensureRefreshedMock = vi.fn();
vi.mock('./refreshClient', () => ({
	refreshClient: {
		ensureRefreshed: (...args: unknown[]) => ensureRefreshedMock(...args),
	},
}));

import { apiClient } from './api';
import { AuthTokenManager } from './auth';

describe('ApiClient.request() エラーハンドリング', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(AuthTokenManager.getAccessToken).mockReturnValue('mock-token');
		vi.mocked(AuthTokenManager.isTokenExpired).mockReturnValue(false);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('Content-Type が JSON の非 OK レスポンスでサーバーの message を throw する', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue({ message: 'カスタムサーバーエラー' }),
			}),
		);

		await expect(apiClient.getMemo('test-id')).rejects.toThrow('カスタムサーバーエラー');
	});

	it('JSON パース失敗時は HTTP error! status: N にフォールバックする', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 503,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
			}),
		);

		await expect(apiClient.getMemo('test-id')).rejects.toThrow('HTTP error! status: 503');
	});

	it('Content-Type が JSON でない場合は HTTP error! status: N を throw する', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				headers: new Headers({ 'content-type': 'text/html' }),
				json: vi.fn(),
			}),
		);

		await expect(apiClient.getMemo('test-id')).rejects.toThrow('HTTP error! status: 404');
	});

	it('401 + REQUIRED + refresh 失敗 の場合は認証エラーを throw する', async () => {
		ensureRefreshedMock.mockRejectedValue(new Error('refresh failed'));
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue({ message: 'Unauthorized' }),
			}),
		);

		await expect(apiClient.getMemo('test-id')).rejects.toThrow(
			'認証エラー: ログインし直してください',
		);
		expect(ensureRefreshedMock).toHaveBeenCalledTimes(1);
	});
});

describe('ApiClient.request() 401 透過リフレッシュ', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(AuthTokenManager.getAccessToken).mockReturnValue('mock-token');
		vi.mocked(AuthTokenManager.isTokenExpired).mockReturnValue(false);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('REQUIRED で 401 → refresh 成功で同一リクエストを再送し成功レスポンスを返す', async () => {
		ensureRefreshedMock.mockResolvedValueOnce({
			accessToken: 'fresh-token',
			user: {
				id: '1',
				email: 'e',
				name: 'n',
				role: 'USER',
				createdAt: '',
				updatedAt: '',
			},
		});
		const successPayload = {
			id: 'memo-1',
			title: 'after refresh',
			content: '',
			createdAt: '',
			updatedAt: '',
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: false,
				status: 401,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue({ message: 'Unauthorized' }),
			})
			.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue(successPayload),
			});
		vi.stubGlobal('fetch', fetchMock);

		const result = await apiClient.getMemo('memo-1');

		expect(result).toEqual(successPayload);
		expect(ensureRefreshedMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('再送も 401 の場合は ensureRefreshed を二度発火させず認証エラーを throw する', async () => {
		ensureRefreshedMock.mockResolvedValueOnce({
			accessToken: 'fresh-token',
			user: {
				id: '1',
				email: 'e',
				name: 'n',
				role: 'USER',
				createdAt: '',
				updatedAt: '',
			},
		});
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			headers: new Headers({ 'content-type': 'application/json' }),
			json: vi.fn().mockResolvedValue({ message: 'Unauthorized' }),
		});
		vi.stubGlobal('fetch', fetchMock);

		await expect(apiClient.getMemo('memo-1')).rejects.toThrow(
			'認証エラー: ログインし直してください',
		);
		expect(ensureRefreshedMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('NONE 経路は 401 でも refresh を発火させない', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue({ message: 'Unauthorized' }),
			}),
		);

		await expect(apiClient.health()).rejects.toThrow();
		expect(ensureRefreshedMock).not.toHaveBeenCalled();
	});

	it('OPTIONAL 経路は 401 でも refresh を発火させない', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue({ message: 'Unauthorized' }),
			}),
		);

		await expect(apiClient.getPublicThemes()).rejects.toThrow();
		expect(ensureRefreshedMock).not.toHaveBeenCalled();
	});

	it('再送リクエストには新しい Access Token がヘッダに乗る', async () => {
		const tokens = ['mock-token', 'fresh-token'];
		vi.mocked(AuthTokenManager.getAccessToken).mockImplementation(() => tokens.shift() ?? null);
		ensureRefreshedMock.mockResolvedValueOnce({
			accessToken: 'fresh-token',
			user: {
				id: '1',
				email: 'e',
				name: 'n',
				role: 'USER',
				createdAt: '',
				updatedAt: '',
			},
		});
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: false,
				status: 401,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue({ message: 'Unauthorized' }),
			})
			.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue({}),
			});
		vi.stubGlobal('fetch', fetchMock);

		await apiClient.getMemo('memo-1');

		const firstHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
		const retryHeaders = fetchMock.mock.calls[1][1].headers as Record<string, string>;
		expect(firstHeaders.Authorization).toBe('Bearer mock-token');
		expect(retryHeaders.Authorization).toBe('Bearer fresh-token');
	});
});

describe('ApiClient.verifyInvitationCode()', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('成功時に InvitationVerificationResponse を返す', async () => {
		const mockResponse: InvitationVerificationResponse = {
			valid: true,
			code: 'TEST-CODE',
			maxUses: null,
			currentUses: 0,
			expiresAt: null,
			isActive: true,
		};
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue(mockResponse),
			}),
		);

		const result = await apiClient.verifyInvitationCode('TEST-CODE');
		expect(result).toEqual(mockResponse);
	});

	it('非 OK レスポンスでサーバーの message を含む Error を throw する', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue({ message: '招待コードが無効です' }),
			}),
		);

		await expect(apiClient.verifyInvitationCode('BAD-CODE')).rejects.toThrow(
			'招待コードが無効です',
		);
	});

	it('JSON message がない場合は HTTP error! status: N にフォールバックする（旧 "Invalid invitation code" ではない）', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 422,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue({ statusCode: 422 }),
			}),
		);

		await expect(apiClient.verifyInvitationCode('BAD-CODE')).rejects.toThrow(
			'HTTP error! status: 422',
		);
	});
});

describe('ApiClient.health()', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('GET /health を認証なしで呼び { status: "ok" } を返す', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'content-type': 'application/json' }),
			json: vi.fn().mockResolvedValue({ status: 'ok' }),
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await apiClient.health();
		expect(result).toEqual({ status: 'ok' });

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://localhost:3000/health');
		const headers = (init?.headers ?? {}) as Record<string, string>;
		expect(headers.Authorization).toBeUndefined();
	});

	it('非 OK レスポンスでエラーを throw する', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 503,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue({ message: 'Service unavailable' }),
			}),
		);

		await expect(apiClient.health()).rejects.toThrow('Service unavailable');
	});
});

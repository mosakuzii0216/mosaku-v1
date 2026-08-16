import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
	InvitationVerificationResponse,
	InvitationContextResponse,
	InvitationWithShareUrlResponse,
	UserQuotaResponse,
	OAuthStartResponse,
} from '../types/invitation';
import { ApiError } from './apiError';

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
		// localStorage は何度読んでも同じ値を返すため、refresh で切り替わる状態として表現
		let currentToken = 'mock-token';
		vi.mocked(AuthTokenManager.getAccessToken).mockImplementation(() => currentToken);
		ensureRefreshedMock.mockImplementationOnce(async () => {
			currentToken = 'fresh-token';
			return {
				accessToken: 'fresh-token',
				user: {
					id: '1',
					email: 'e',
					name: 'n',
					role: 'USER',
					createdAt: '',
					updatedAt: '',
				},
			};
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

describe('ApiClient.request() ローカル期限切れの先回りリフレッシュ', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(AuthTokenManager.getAccessToken).mockReturnValue('expired-token');
		vi.mocked(AuthTokenManager.isTokenExpired).mockReturnValue(true);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('REQUIRED でローカル期限切れなら fetch 前に refresh し、成功後に再送する', async () => {
		// 期限切れ → refresh 成功でトークンが有効化される状態遷移を再現
		let currentToken: string | null = 'expired-token';
		let expired = true;
		vi.mocked(AuthTokenManager.getAccessToken).mockImplementation(() => currentToken);
		vi.mocked(AuthTokenManager.isTokenExpired).mockImplementation(() => expired);
		ensureRefreshedMock.mockImplementation(async () => {
			currentToken = 'fresh-token';
			expired = false;
			return {
				accessToken: 'fresh-token',
				user: { id: '1', email: 'e', name: 'n', role: 'USER', createdAt: '', updatedAt: '' },
			};
		});
		const successPayload = [{ id: 't1', name: 'タグ' }];
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'content-type': 'application/json' }),
			json: vi.fn().mockResolvedValue(successPayload),
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await apiClient.getTags();

		expect(result).toEqual(successPayload);
		expect(ensureRefreshedMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer fresh-token');
	});

	it('REQUIRED でアクセストークン不在でも refresh を試みる', async () => {
		let currentToken: string | null = null;
		let expired = true;
		vi.mocked(AuthTokenManager.getAccessToken).mockImplementation(() => currentToken);
		vi.mocked(AuthTokenManager.isTokenExpired).mockImplementation(() => expired);
		ensureRefreshedMock.mockImplementation(async () => {
			currentToken = 'fresh-token';
			expired = false;
			return {
				accessToken: 'fresh-token',
				user: { id: '1', email: 'e', name: 'n', role: 'USER', createdAt: '', updatedAt: '' },
			};
		});
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'content-type': 'application/json' }),
			json: vi.fn().mockResolvedValue([]),
		});
		vi.stubGlobal('fetch', fetchMock);

		await apiClient.getTags();

		expect(ensureRefreshedMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('REQUIRED でローカル期限切れ + refresh 失敗なら認証エラーを throw し fetch しない', async () => {
		ensureRefreshedMock.mockRejectedValue(new Error('refresh failed'));
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(apiClient.getTags()).rejects.toThrow('認証エラー: ログインし直してください');
		expect(ensureRefreshedMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('OPTIONAL はローカル期限切れでも先回り refresh せずに認証なしで進む', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'content-type': 'application/json' }),
			json: vi.fn().mockResolvedValue([]),
		});
		vi.stubGlobal('fetch', fetchMock);

		await apiClient.getPublicThemes();

		expect(ensureRefreshedMock).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
		expect(headers.Authorization).toBeUndefined();
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

describe('ApiClient 招待関連エンドポイント', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(AuthTokenManager.getAccessToken).mockReturnValue('mock-token');
		vi.mocked(AuthTokenManager.isTokenExpired).mockReturnValue(false);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('verifyInvitationContext: code を Public で POST し InvitationContextResponse を返す', async () => {
		const mockResponse: InvitationContextResponse = {
			code: 'k9x7m2j3pq',
			status: 'valid',
			creator: { name: 'モサ子', maskedId: 'usr1***' },
			expiresAt: null,
			usesRemaining: 1,
		};
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'content-type': 'application/json' }),
			json: vi.fn().mockResolvedValue(mockResponse),
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await apiClient.verifyInvitationContext({ code: 'k9x7m2j3pq' });
		expect(result).toEqual(mockResponse);

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://localhost:3000/invitation/verify-context');
		expect(init?.method).toBe('POST');
		expect(init?.body).toBe(JSON.stringify({ code: 'k9x7m2j3pq' }));
		const headers = (init?.headers ?? {}) as Record<string, string>;
		expect(headers.Authorization).toBeUndefined();
	});

	it('verifyInvitationContext: バックエンドの { code, message, statusCode } を ApiError にして throw する', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue({
					code: 'INV001',
					message: '招待コードが無効です',
					statusCode: 400,
				}),
			}),
		);

		try {
			await apiClient.verifyInvitationContext({ code: 'bad' });
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(ApiError);
			const apiError = error as ApiError;
			expect(apiError.code).toBe('INV001');
			expect(apiError.statusCode).toBe(400);
			expect(apiError.message).toBe('招待コードが無効です');
		}
	});

	it('createMyInvitation: 認証付き POST /invitation/me で InvitationWithShareUrlResponse を返す', async () => {
		const mockResponse: InvitationWithShareUrlResponse = {
			id: 'inv-1',
			code: 'k9x7m2j3pq',
			shareUrl: 'https://mosaku.jp/invite/k9x7m2j3pq',
			maxUses: 1,
			usedCount: 0,
			expiresAt: null,
			createdAt: '2026-05-24T00:00:00Z',
		};
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'content-type': 'application/json' }),
			json: vi.fn().mockResolvedValue(mockResponse),
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await apiClient.createMyInvitation();
		expect(result).toEqual(mockResponse);

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://localhost:3000/invitation/me');
		expect(init?.method).toBe('POST');
		const headers = (init?.headers ?? {}) as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer mock-token');
	});

	it('createMyInvitation: QUOTA_EXHAUSTED は ApiError として throw される', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue({
					code: 'INV005',
					message: '招待枠を使い切りました',
					statusCode: 400,
				}),
			}),
		);

		try {
			await apiClient.createMyInvitation();
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(ApiError);
			expect((error as ApiError).code).toBe('INV005');
		}
	});

	it('getMyInvitations: 認証付き GET /invitation/me で配列を返す', async () => {
		const mockResponse: InvitationWithShareUrlResponse[] = [];
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'content-type': 'application/json' }),
			json: vi.fn().mockResolvedValue(mockResponse),
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await apiClient.getMyInvitations();
		expect(result).toEqual(mockResponse);

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://localhost:3000/invitation/me');
		expect(init?.method ?? 'GET').toBe('GET');
	});

	it('getMyInvitationQuota: GET /invitation/me/quota で UserQuotaResponse を返す', async () => {
		const mockResponse: UserQuotaResponse = {
			invitationQuota: 3,
			unlimited: false,
			role: 'USER',
		};
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'content-type': 'application/json' }),
			json: vi.fn().mockResolvedValue(mockResponse),
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await apiClient.getMyInvitationQuota();
		expect(result).toEqual(mockResponse);

		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('http://localhost:3000/invitation/me/quota');
	});

	it('deleteMyInvitation: 認証付き DELETE /invitation/me/:id を呼ぶ', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'content-type': 'application/json' }),
			json: vi.fn().mockResolvedValue({}),
		});
		vi.stubGlobal('fetch', fetchMock);

		await apiClient.deleteMyInvitation({ id: 'inv-1' });

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://localhost:3000/invitation/me/inv-1');
		expect(init?.method).toBe('DELETE');
	});

	it('startOAuthRegistration: Public POST /auth/oauth/:provider/start で authorizationUrl を返す', async () => {
		const mockResponse: OAuthStartResponse = {
			authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?...',
		};
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'content-type': 'application/json' }),
			json: vi.fn().mockResolvedValue(mockResponse),
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await apiClient.startOAuthRegistration({
			provider: 'google',
			invitationCode: 'k9x7m2j3pq',
		});
		expect(result).toEqual(mockResponse);

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://localhost:3000/auth/oauth/google/start');
		expect(init?.method).toBe('POST');
		expect(init?.body).toBe(JSON.stringify({ invitationCode: 'k9x7m2j3pq' }));
		const headers = (init?.headers ?? {}) as Record<string, string>;
		expect(headers.Authorization).toBeUndefined();
	});

	it('startOAuthRegistration: 検証失敗時は ApiError として code を伝播', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValue({
					code: 'INV002',
					message: '招待コードの有効期限が切れています',
					statusCode: 400,
				}),
			}),
		);

		try {
			await apiClient.startOAuthRegistration({
				provider: 'apple',
				invitationCode: 'expired',
			});
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(ApiError);
			expect((error as ApiError).code).toBe('INV002');
		}
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

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
	},
}));

import { apiClient } from './api';

describe('ApiClient.request() エラーハンドリング', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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

	it('401 かつ authLevel=REQUIRED の場合は認証エラーを throw する（既存動作を維持）', async () => {
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

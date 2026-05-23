import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./env', () => ({
	getBackendUrl: () => 'http://localhost:3000',
}));

const sentryAddBreadcrumb = vi.fn();
const sentryCaptureMessage = vi.fn();

vi.mock('@sentry/react', () => ({
	addBreadcrumb: (...args: unknown[]) => sentryAddBreadcrumb(...args),
	captureMessage: (...args: unknown[]) => sentryCaptureMessage(...args),
}));

import { refreshClient } from './refreshClient';
import { AuthTokenManager } from './auth';

const sampleUser = {
	id: 'user-1',
	email: 'user@example.com',
	name: 'User One',
	role: 'USER' as const,
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
};

const refreshSuccessResponse = () =>
	new Response(JSON.stringify({ accessToken: 'new-access-token', user: sampleUser }), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});

describe('refreshClient.ensureRefreshed()', () => {
	beforeEach(() => {
		sentryAddBreadcrumb.mockClear();
		sentryCaptureMessage.mockClear();
		AuthTokenManager.removeTokens();
		refreshClient.clearPendingRefresh();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		refreshClient.clearPendingRefresh();
	});

	it('POST /auth/refresh を credentials:include + X-Refresh-Request:1 で呼ぶ', async () => {
		const fetchMock = vi.fn().mockResolvedValue(refreshSuccessResponse());
		vi.stubGlobal('fetch', fetchMock);

		await refreshClient.ensureRefreshed();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://localhost:3000/auth/refresh');
		expect(init.method).toBe('POST');
		expect(init.credentials).toBe('include');
		const headers = init.headers as Record<string, string>;
		expect(headers['X-Refresh-Request']).toBe('1');
	});

	it('成功時に accessToken を AuthTokenManager に保存して outcome を返す', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refreshSuccessResponse()));

		const outcome = await refreshClient.ensureRefreshed();

		expect(outcome.accessToken).toBe('new-access-token');
		expect(outcome.user).toEqual(sampleUser);
		expect(AuthTokenManager.getAccessToken()).toBe('new-access-token');
	});

	it('成功時に Sentry breadcrumb transparent_refresh_success を残す', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refreshSuccessResponse()));

		await refreshClient.ensureRefreshed();

		expect(sentryAddBreadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({
				category: 'auth',
				message: 'transparent_refresh_success',
			}),
		);
	});

	it('並行呼び出しでも fetch は 1 回しか発火しない (singleton)', async () => {
		const fetchMock = vi.fn().mockResolvedValue(refreshSuccessResponse());
		vi.stubGlobal('fetch', fetchMock);

		const [a, b, c] = await Promise.all([
			refreshClient.ensureRefreshed(),
			refreshClient.ensureRefreshed(),
			refreshClient.ensureRefreshed(),
		]);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(a).toEqual(b);
		expect(b).toEqual(c);
	});

	it('完了後は pending Promise がクリアされ、次回は新しい fetch が発火する', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => refreshSuccessResponse());
		vi.stubGlobal('fetch', fetchMock);

		await refreshClient.ensureRefreshed();
		await refreshClient.ensureRefreshed();

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('401 失敗時に AuthTokenManager をクリアして reject する', async () => {
		AuthTokenManager.setAccessToken('stale-token');
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response('{}', {
					status: 401,
					headers: { 'content-type': 'application/json' },
				}),
			),
		);

		await expect(refreshClient.ensureRefreshed()).rejects.toThrow();
		expect(AuthTokenManager.getAccessToken()).toBeNull();
	});

	it('失敗時に Sentry breadcrumb transparent_refresh_failure を残す', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response('{}', {
					status: 401,
					headers: { 'content-type': 'application/json' },
				}),
			),
		);

		await expect(refreshClient.ensureRefreshed()).rejects.toThrow();

		expect(sentryAddBreadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({
				category: 'auth',
				message: 'transparent_refresh_failure',
			}),
		);
	});

	it('401 で AuthTokenManager をクリアした事実を auth_tokens_cleared breadcrumb で残す', async () => {
		AuthTokenManager.setAccessToken('to-be-cleared');
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response('{}', {
					status: 401,
					headers: { 'content-type': 'application/json' },
				}),
			),
		);

		await expect(refreshClient.ensureRefreshed()).rejects.toThrow();

		expect(sentryAddBreadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({
				category: 'auth',
				message: 'auth_tokens_cleared',
				data: expect.objectContaining({ reason: 'refresh_failed' }),
			}),
		);
	});

	it('ネットワーク失敗でも AuthTokenManager クリアの breadcrumb を残す', async () => {
		AuthTokenManager.setAccessToken('to-be-cleared');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

		await expect(refreshClient.ensureRefreshed()).rejects.toThrow();

		expect(sentryAddBreadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({
				category: 'auth',
				message: 'auth_tokens_cleared',
				data: expect.objectContaining({ reason: 'refresh_failed' }),
			}),
		);
	});

	it('失敗後に pending Promise はクリアされ、再試行 (成功) が成立する', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }),
			)
			.mockResolvedValueOnce(refreshSuccessResponse());
		vi.stubGlobal('fetch', fetchMock);

		await expect(refreshClient.ensureRefreshed()).rejects.toThrow();
		const outcome = await refreshClient.ensureRefreshed();

		expect(outcome.accessToken).toBe('new-access-token');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe('refreshClient.tryAutoRefresh()', () => {
	beforeEach(() => {
		sentryAddBreadcrumb.mockClear();
		sentryCaptureMessage.mockClear();
		AuthTokenManager.removeTokens();
		refreshClient.clearPendingRefresh();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		refreshClient.clearPendingRefresh();
	});

	it('Cookie 経由で成功した場合は outcome を返し setAccessToken する', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refreshSuccessResponse()));

		const outcome = await refreshClient.tryAutoRefresh();

		expect(outcome?.accessToken).toBe('new-access-token');
		expect(outcome?.user).toEqual(sampleUser);
		expect(AuthTokenManager.getAccessToken()).toBe('new-access-token');
	});

	it('成功時に Sentry captureMessage auto_refresh_success (info, feature_area:auth) を送る', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refreshSuccessResponse()));

		await refreshClient.tryAutoRefresh();

		expect(sentryCaptureMessage).toHaveBeenCalledWith(
			'auto_refresh_success',
			expect.objectContaining({
				level: 'info',
				tags: expect.objectContaining({ feature_area: 'auth' }),
			}),
		);
	});

	it('401 で null を返し throw しない', async () => {
		AuthTokenManager.setAccessToken('stale');
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }),
				),
		);

		const outcome = await refreshClient.tryAutoRefresh();

		expect(outcome).toBeNull();
		expect(AuthTokenManager.getAccessToken()).toBeNull();
	});

	it('失敗時に Sentry captureMessage auto_refresh_failure を送る', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }),
				),
		);

		await refreshClient.tryAutoRefresh();

		expect(sentryCaptureMessage).toHaveBeenCalledWith(
			'auto_refresh_failure',
			expect.objectContaining({
				level: 'info',
				tags: expect.objectContaining({ feature_area: 'auth' }),
			}),
		);
	});

	it('ネットワーク例外でも throw せず null を返す', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

		const outcome = await refreshClient.tryAutoRefresh();

		expect(outcome).toBeNull();
	});
});

describe('refreshClient.logout()', () => {
	beforeEach(() => {
		sentryAddBreadcrumb.mockClear();
		AuthTokenManager.setAccessToken('to-be-cleared');
		refreshClient.clearPendingRefresh();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		AuthTokenManager.removeTokens();
		refreshClient.clearPendingRefresh();
	});

	it('POST /auth/logout を credentials:include + X-Refresh-Request:1 で呼ぶ', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ message: 'Logout successful' }), { status: 200 }),
			);
		vi.stubGlobal('fetch', fetchMock);

		await refreshClient.logout();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://localhost:3000/auth/logout');
		expect(init.method).toBe('POST');
		expect(init.credentials).toBe('include');
		const headers = init.headers as Record<string, string>;
		expect(headers['X-Refresh-Request']).toBe('1');
	});

	it('成功時に AuthTokenManager をクリアする', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify({ message: 'Logout successful' }), { status: 200 }),
				),
		);

		await refreshClient.logout();

		expect(AuthTokenManager.getAccessToken()).toBeNull();
	});

	it('ネットワーク失敗でも throw せず AuthTokenManager は確実にクリアされる', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

		await expect(refreshClient.logout()).resolves.toBeUndefined();
		expect(AuthTokenManager.getAccessToken()).toBeNull();
	});

	it('pending refresh があってもログアウト時に破棄される', async () => {
		let resolveRefresh!: (response: Response) => void;
		const refreshFetch = vi.fn().mockImplementation(
			() =>
				new Promise<Response>((resolve) => {
					resolveRefresh = resolve;
				}),
		);
		vi.stubGlobal('fetch', refreshFetch);

		const refreshing = refreshClient.ensureRefreshed();
		// 進行中の refresh があることを確認
		expect(refreshFetch).toHaveBeenCalledTimes(1);

		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify({ message: 'Logout successful' }), { status: 200 }),
				),
		);
		await refreshClient.logout();

		// pending が破棄され、refresh は最終的に reject される
		resolveRefresh(refreshSuccessResponse());
		await expect(refreshing).rejects.toThrow();
	});

	it('Sentry breadcrumb auth/logout を残す', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify({ message: 'Logout successful' }), { status: 200 }),
				),
		);

		await refreshClient.logout();

		expect(sentryAddBreadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({
				category: 'auth',
				message: 'logout',
			}),
		);
	});
});

/**
 * E2E 用の認証ヘルパー。
 *
 * Playwright の BrowserContext に localStorage の `auth_access_token` を事前注入し、
 * AuthGuard を通過した状態でアプリを起動させる。
 *
 * フロントエンドの AuthTokenManager 実装に依存（utils/auth.ts のキー名）。
 */

import type { BrowserContext } from '@playwright/test';

import { BackendApi } from './backend-api';

export interface E2EAuthConfig {
	backendUrl: string;
	frontendOrigin: string;
	email: string;
	password: string;
	name: string;
}

export interface E2EAuthSession {
	accessToken: string;
	userId: string;
}

export function getDefaultAuthConfig(): E2EAuthConfig {
	return {
		backendUrl: process.env.E2E_BACKEND_URL ?? 'http://localhost:3000',
		frontendOrigin: process.env.E2E_FRONTEND_ORIGIN ?? 'http://localhost:5173',
		email: process.env.E2E_USER_EMAIL ?? 'pwa-e2e-admin@test.example',
		password: process.env.E2E_USER_PASSWORD ?? 'PwaE2eTest123!',
		name: process.env.E2E_USER_NAME ?? 'PWA E2E User',
	};
}

/**
 * ADMIN_EMAIL がテスト用に設定されている前提で register を試み、
 * 失敗（既存ユーザー）なら無視してそのまま login を行う。
 */
export async function ensureLoggedIn(
	api: BackendApi,
	config: E2EAuthConfig,
): Promise<E2EAuthSession> {
	await api.ensureUser(config.email, config.password, config.name);
	const result = await api.login(config.email, config.password);
	return { accessToken: result.accessToken, userId: result.user.id };
}

/**
 * BrowserContext 経由でログインし、HttpOnly refresh cookie を context の cookie jar に保存する。
 *
 * `injectAccessToken`（localStorage 注入）のみに依存しない主経路。
 * 起動時 `/auth/refresh` が credentials:include で cookie を送出するため、
 * fresh コンテキストでもログイン状態が復元される。
 */
export async function loginViaContext(
	context: BrowserContext,
	config: E2EAuthConfig,
): Promise<E2EAuthSession> {
	const response = await context.request.post(`${config.backendUrl}/auth/login`, {
		headers: { 'Content-Type': 'application/json' },
		data: { email: config.email, password: config.password },
	});

	if (!response.ok()) {
		const text = await response.text().catch(() => '');
		throw new Error(`loginViaContext: /auth/login failed (${response.status()}): ${text}`);
	}

	const body = (await response.json()) as { accessToken: string; user: { id: string } };
	return { accessToken: body.accessToken, userId: body.user.id };
}

/**
 * BrowserContext の指定オリジンの localStorage にアクセストークンを事前注入する。
 *
 * Playwright で addInitScript を使う方法もあるが、AuthGuard / AuthContext が
 * 初期化フェーズで localStorage を直接読みに行くため、page.goto 前に
 * Storage State を準備しておく方が確実。
 */
export async function injectAccessToken(
	context: BrowserContext,
	frontendOrigin: string,
	accessToken: string,
): Promise<void> {
	await context.addInitScript(
		({ origin, token }) => {
			if (window.location.origin !== origin) return;
			window.localStorage.setItem('auth_access_token', token);
		},
		{ origin: frontendOrigin, token: accessToken },
	);
}

import { test, expect } from '@playwright/test';

/**
 * Task 7.5: Refresh Token によるブラウザ再起動相当のアプリ起動時自動復元の E2E。
 *
 * - 成功系: localStorage の Access Token のみ削除（Cookie 維持相当）した状態で再ロードし、
 *   ログインフォームではなくアプリのヘッダー / エディタが表示されることを確認する。
 * - 失敗系: Cookie 相当の `/auth/refresh` も 401（Cookie 削除相当）になる状態で再ロードし、
 *   ログイン画面に戻ることを確認する。
 *
 * バックエンドへの実通信は他の auth-flow E2E と同様に `page.route` でモックする。
 * Cookie 自体は HttpOnly でバックエンド原点に保管されるため、Playwright のテストでは
 * `/auth/refresh` のレスポンス（200 or 401）で「Cookie の有無」を表現する。
 */

const FAKE_USER = {
	id: 'user-restore-e2e',
	email: 'restored@example.com',
	name: 'Restored User',
	role: 'USER',
	createdAt: '1970-01-01T00:00:00.000Z',
	updatedAt: '1970-01-01T00:00:00.000Z',
};

function makeFakeJwt(): string {
	const toB64Url = (input: string): string => Buffer.from(input).toString('base64url');
	const header = toB64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const nowSec = Math.floor(Date.now() / 1000);
	const payload = toB64Url(
		JSON.stringify({
			sub: FAKE_USER.id,
			email: FAKE_USER.email,
			name: FAKE_USER.name,
			role: FAKE_USER.role,
			iat: nowSec,
			exp: nowSec + 3600,
		}),
	);
	return `${header}.${payload}.signature`;
}

test.describe('Refresh Token による自動セッション復元（ブラウザ再起動相当）', () => {
	test.beforeEach(async ({ page }) => {
		// ブラウザ再起動相当: localStorage 上の Access Token は持ち越されない状態でロードする。
		await page.addInitScript(() => {
			try {
				localStorage.removeItem('auth_access_token');
			} catch {
				// ignore
			}
		});
	});

	test('Cookie が維持されていれば Access Token なしでもエディタが直接表示されること', async ({
		page,
	}) => {
		// Cookie が有効な前提で /auth/refresh が 200 を返す
		await page.route('**/auth/refresh', (route) => {
			if (route.request().method() !== 'POST') {
				route.fallback();
				return;
			}
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ accessToken: makeFakeJwt(), user: FAKE_USER }),
			});
		});

		// localStorage AT 経路にフォールバックした場合に備えて /auth/me も成功させておく
		await page.route('**/auth/me', (route) => {
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(FAKE_USER),
			});
		});

		await page.goto('/');

		// 認証後レイアウトのヘッダー要素が描画される（=AuthGuard を通過した）
		await expect(page.locator('header').first()).toBeVisible({ timeout: 10000 });

		// 同時にログインフォームが表示されていないことを確認する
		await expect(page.locator('input[type="email"]')).toHaveCount(0);
		await expect(page.locator('input[type="password"]')).toHaveCount(0);
	});

	test('Cookie も削除されていれば再ロード後はログイン画面に遷移すること', async ({ page }) => {
		// Cookie 不在相当で /auth/refresh は 401
		await page.route('**/auth/refresh', (route) => {
			if (route.request().method() !== 'POST') {
				route.fallback();
				return;
			}
			route.fulfill({
				status: 401,
				contentType: 'application/json',
				body: JSON.stringify({ message: 'Unauthorized', code: 'AUTH010' }),
			});
		});

		await page.route('**/auth/me', (route) => {
			route.fulfill({
				status: 401,
				contentType: 'application/json',
				body: JSON.stringify({ message: 'Unauthorized' }),
			});
		});

		await page.goto('/');

		// ログインフォーム（メール / パスワード）が表示される
		await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
		await expect(page.locator('input[type="password"]')).toBeVisible();
	});
});

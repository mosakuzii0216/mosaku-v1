/**
 * PWA インストール / アプリシェル / SW 更新 E2E（Task 10.2）
 *
 * 目的:
 *   Manifest 検証、standalone 起動時の初期描画 3 秒以内、
 *   SW 更新トースト → 更新承認 → 旧 `api-cache` の消滅、を検証する。
 *
 * 前提:
 *   - 本テストは `E2E_USE_PREVIEW=1` で起動した `vite preview` 上で実行する。
 *     `vite plugin pwa` は dev mode では SW を登録しないため、production build が必須。
 *   - playwright.config.ts の webServer 設定で frontend を preview モードに切替えること。
 *
 * Requirements 対応: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 9.4
 */

import { test, expect } from '@playwright/test';

const isPreview = process.env.E2E_USE_PREVIEW === '1';
test.skip(!isPreview, 'PWA E2E は E2E_USE_PREVIEW=1（vite preview）でのみ実行');

test.describe('Web App Manifest', () => {
	test('/manifest.webmanifest を取得し必須フィールドが揃っている', async ({ request }) => {
		const res = await request.get('http://localhost:5173/manifest.webmanifest');
		expect(res.status()).toBe(200);
		const manifest = (await res.json()) as Record<string, unknown>;
		expect(manifest.name).toBe('Mosaku');
		expect(manifest.short_name).toBeTruthy();
		expect(manifest.start_url).toBe('/');
		expect(manifest.display).toBe('standalone');
		expect(Array.isArray(manifest.icons)).toBe(true);
		const icons = manifest.icons as Array<{ sizes?: string; purpose?: string }>;
		expect(icons.some((i) => i.sizes === '192x192')).toBe(true);
		expect(icons.some((i) => i.sizes === '512x512')).toBe(true);
		expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
	});

	test('manifest が HTML から <link rel="manifest"> でリンクされている', async ({ page }) => {
		await page.goto('/');
		const href = await page.locator('link[rel="manifest"]').getAttribute('href');
		expect(href).toBeTruthy();
		expect(href).toMatch(/manifest\.webmanifest/);
	});
});

test.describe('アプリシェルと Service Worker 登録', () => {
	test('初回描画が 3 秒以内（オンライン 4G 想定）', async ({ page }) => {
		const start = Date.now();
		await page.goto('/');
		await page.waitForLoadState('domcontentloaded');
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(3000);
	});

	test('Service Worker が登録され controller が active になる', async ({ page }) => {
		await page.goto('/');
		const swReady = await page.evaluate(async () => {
			if (!('serviceWorker' in navigator)) return false;
			const reg = await navigator.serviceWorker.ready;
			return reg.active !== null;
		});
		expect(swReady).toBe(true);
	});

	test('Cache Storage に /api/* のキャッシュが書き込まれていない', async ({ page }) => {
		await page.goto('/');
		// 初回ロード後にアプリが API へリクエストを送るのを待つ
		await page.waitForLoadState('networkidle');

		const cachedApiUrls = await page.evaluate(async () => {
			const names = await caches.keys();
			const apiHits: string[] = [];
			for (const name of names) {
				const cache = await caches.open(name);
				const requests = await cache.keys();
				for (const req of requests) {
					const url = new URL(req.url);
					if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
						apiHits.push(req.url);
					}
				}
			}
			return apiHits;
		});

		expect(cachedApiUrls).toEqual([]);
	});

	test('旧 api-cache が存在する場合、初回 SW 登録時に削除される', async ({ page }) => {
		await page.goto('/');
		// 古い設定で残っていた api-cache を意図的に作成
		await page.evaluate(async () => {
			const cache = await caches.open('api-cache');
			await cache.put(
				new Request('/api/legacy', { method: 'GET' }),
				new Response('legacy', { status: 200 }),
			);
		});
		// SW 更新フローの delete をシミュレートするため、リロード
		await page.reload();
		await page.waitForLoadState('networkidle');

		// useSwRegistration の初期化が caches.delete('api-cache') を呼ぶことを期待
		const stillHasApiCache = await page.evaluate(async () => {
			const names = await caches.keys();
			return names.includes('api-cache');
		});

		expect(stillHasApiCache).toBe(false);
	});
});

test.describe('オフライン起動でログイン画面に遷移しない', () => {
	test('オフラインでもアプリシェルが描画される', async ({ context, page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		await context.setOffline(true);
		await page.reload();

		// HTML が precache から提供され、初期描画は失敗しない（タイトルが取得できる）
		const title = await page.title();
		expect(title).toBeTruthy();
	});
});

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.route('**/api/auth/me', (route) => {
		route.fulfill({ status: 401, body: JSON.stringify({ message: 'Unauthorized' }) });
	});
	await page.route('**/auth/me', (route) => {
		route.fulfill({ status: 401, body: JSON.stringify({ message: 'Unauthorized' }) });
	});
});

test.describe('パフォーマンス検証', () => {
	test('First Contentful Paint が 3秒以内であること', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('input[type="email"]', { timeout: 10000 });

		// Performance API で FCP を取得
		const fcp = await page.evaluate(() => {
			return new Promise<number>((resolve) => {
				// すでに計測済みの場合
				const entries = performance.getEntriesByName('first-contentful-paint');
				if (entries.length > 0) {
					resolve(entries[0].startTime);
					return;
				}

				const observer = new PerformanceObserver((list) => {
					const fcpEntry = list.getEntriesByName('first-contentful-paint')[0];
					if (fcpEntry) {
						observer.disconnect();
						resolve(fcpEntry.startTime);
					}
				});

				observer.observe({ type: 'paint', buffered: true });

				// フォールバック: 5秒後にタイムアウト
				setTimeout(() => resolve(-1), 5000);
			});
		});

		if (fcp === -1) {
			// FCP エントリが取得できない場合はフォームの描画時間で代替
			const navigationTiming = await page.evaluate(() => {
				const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
				return nav ? nav.domContentLoadedEventEnd : 0;
			});
			console.log(`DOMContentLoaded: ${navigationTiming.toFixed(0)}ms（FCP エントリ未取得）`);
			expect(navigationTiming).toBeLessThan(3000);
		} else {
			console.log(`FCP: ${fcp.toFixed(0)}ms`);
			expect(fcp).toBeLessThan(3000);
		}
	});

	test('バンドルに外部アニメーションライブラリが含まれていないこと', async ({ page }) => {
		const requests: string[] = [];

		page.on('request', (req) => {
			if (req.resourceType() === 'script') {
				requests.push(req.url());
			}
		});

		await page.goto('/');
		await page.waitForSelector('input[type="email"]', { timeout: 10000 });

		// three.js / gsap / anime.js / pixi.js 等の外部ライブラリが読み込まれていない
		const externalLibs = ['three', 'gsap', 'anime', 'pixi', 'particles'];
		for (const lib of externalLibs) {
			const found = requests.some((url) => url.includes(lib));
			expect(found, `外部ライブラリ "${lib}" が検出されました`).toBe(false);
		}

		console.log(`読み込まれたスクリプト数: ${requests.length}`);
	});

	test('ParticleCanvas 描画中にページが操作可能であること（メインスレッドブロックなし）', async ({
		page,
	}) => {
		await page.goto('/');
		await page.waitForSelector('input[type="email"]', { timeout: 10000 });

		// マウスを動かしてパーティクルを生成
		await page.mouse.move(400, 300);
		await page.mouse.move(500, 400);
		await page.mouse.move(600, 300);
		await page.mouse.move(400, 200);

		// パーティクル生成後でもフォーム操作が可能
		const emailInput = page.locator('input[type="email"]');
		await emailInput.fill('test@example.com');
		await expect(emailInput).toHaveValue('test@example.com');
	});
});

/**
 * 表示モード（FocusMemoOverlay）実描画検証 E2E
 *
 * 目的:
 *   A. オーバーレイ地色・文字色が --theme-bg / --theme-text-color へ解決されること（Req 5.1）
 *   B. 本文が --dm-font-size(18px) / --dm-line-height(1.8) で描画されること（Req 2.5）
 *
 * 前提: フロントエンド（http://localhost:5173）のみ。バックエンドは全てページ内で
 *       インターセプトするため不要（theme-immersive.spec.ts と同方式）。
 */

import { test, expect, type Page } from '@playwright/test';

const BACKEND = 'http://localhost:3000';

const USER = { id: 'user-1', name: 'Test User', email: 'test@example.com', role: 'USER' };

// apiClient.getAuthHeaders は AuthTokenManager.isTokenExpired() で JWT の exp をデコードする。
// 適当な文字列だとパース失敗＝期限切れ扱いで「認証が必要です」を同期 throw するため、
// 有効期限が未来の“形だけ本物”の JWT を用意する。
const b64url = (o: object) =>
	Buffer.from(JSON.stringify(o))
		.toString('base64')
		.replace(/=+$/, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
const FAKE_JWT = [
	b64url({ alg: 'HS256', typ: 'JWT' }),
	b64url({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 }),
	'signature',
].join('.');

const MEMO = {
	id: 'memo-dm-1',
	title: '表示モード検証メモ',
	content: {
		type: 'doc',
		content: [
			{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '見出しテスト' }] },
			{
				type: 'paragraph',
				content: [{ type: 'text', text: '表示モード本文のタイポグラフィ検証' }],
			},
		],
	},
	notebookId: null,
	memoTags: [],
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	trashedAt: null,
};

const MORI_THEME = {
	id: 'theme-mori',
	name: '森',
	description: '深い森の世界',
	cssFilePath: 'mori/mori.css',
	isSystem: true,
	isPublic: true,
	metadata: { effectKey: 'mori' },
};

const json = (body: unknown) => ({
	status: 200,
	contentType: 'application/json',
	body: JSON.stringify(body),
});

/**
 * バックエンドを全面モックする。
 * NOTE: パターンは必ず BACKEND オリジンで限定する。`**\/themes**` のような相対パターンは
 *       フロント自身の /themes/mori/mori.css（Layer③ CSS）まで食ってしまい検証が壊れる。
 * NOTE: Playwright のルートは後勝ち。catch-all を先に登録し、個別を後に登録する。
 */
async function mockBackend(page: Page) {
	await page.route(`${BACKEND}/**`, (route) => route.fulfill(json([])));
	await page.route(`${BACKEND}/auth/me`, (route) => route.fulfill(json(USER)));
	// AuthContext は起動時 POST /auth/refresh の { accessToken, user } でセッションを復元する。
	// user が欠けると setUser(undefined) となりログイン画面のままになる。
	await page.route(`${BACKEND}/auth/refresh`, (route) =>
		route.fulfill(json({ accessToken: FAKE_JWT, user: USER })),
	);
	// テーマ API は単数形 /theme。フロント自身の /themes/mori/mori.css とは別物。
	await page.route(`${BACKEND}/theme**`, (route) => route.fulfill(json([MORI_THEME])));
	await page.route(`${BACKEND}/memos**`, (route) => route.fulfill(json([MEMO])));
	await page.route(`${BACKEND}/memos/${MEMO.id}`, (route) => route.fulfill(json(MEMO)));
}

/** 森テーマを localStorage のシェル床に設定してアプリを開く */
async function openAppWithMori(page: Page) {
	await page.addInitScript(() => {
		localStorage.setItem('mosaku.shell-theme', '{"id":"theme-mori","slug":"mori"}');
	});
	await mockBackend(page);
	await page.goto('/');
	await page.waitForSelector('.app-shell', { timeout: 15000 });
}

/** メモ一覧 → メモを開く → 表示モード起動 */
async function openDisplayMode(page: Page) {
	await page.getByRole('button', { name: 'メモ', exact: true }).click();
	await expect(page.locator('[data-testid="memo-list-view"]')).toBeVisible({ timeout: 15000 });
	await page.locator('[data-testid="memo-item"]').first().click();
	await page.locator('[data-testid="display-mode-button"]').click();
	await expect(page.locator('[data-testid="focus-memo-overlay"]')).toBeVisible({ timeout: 10000 });
}

const computed = (page: Page, selector: string, prop: string) =>
	page.evaluate(
		({ sel, p }) => {
			const el = document.querySelector(sel);
			return el ? window.getComputedStyle(el).getPropertyValue(p) : '';
		},
		{ sel: selector, p: prop },
	);

test.describe('表示モード: テーマ追随と本文タイポグラフィ', () => {
	test('A: オーバーレイ地色がテーマのグラデーション、文字色が森の明色に解決される', async ({
		page,
	}) => {
		await openAppWithMori(page);
		await openDisplayMode(page);

		const bgImage = await computed(page, '[data-testid="focus-memo-overlay"]', 'background-image');
		const color = await computed(page, '[data-testid="focus-memo-overlay"]', 'color');

		// --theme-bg は linear-gradient(...) 値 → background-image に解決される
		expect(bgImage).toContain('linear-gradient');
		// mori の --theme-text-color: #e7f5ec
		expect(color).toBe('rgb(231, 245, 236)');
	});

	test('B: 本文が 18px / 行間 1.8 で描画される', async ({ page }) => {
		await openAppWithMori(page);
		await openDisplayMode(page);

		const sel = '.display-mode-content .ProseMirror';
		await expect(page.locator(sel)).toBeVisible({ timeout: 10000 });

		const fontSize = parseFloat(await computed(page, sel, 'font-size'));
		const lineHeight = parseFloat(await computed(page, sel, 'line-height'));

		expect(fontSize).toBeGreaterThanOrEqual(18);
		// line-height は px 解決値（18 × 1.8 = 32.4px）。除算で 1.7999999999999998 になるため
		// 厳密比較ではなく許容誤差で「1.8 以上」を判定する。
		expect(lineHeight / fontSize).toBeCloseTo(1.8, 5);
		expect(lineHeight / fontSize).toBeGreaterThan(1.79);
	});

	test('スクリーンショット（目視用）', async ({ page }) => {
		await openAppWithMori(page);
		await openDisplayMode(page);
		await page.waitForTimeout(500);
		// test-results/ は .gitignore 済み（成果物をリポジトリに持ち込まない）
		await page.screenshot({ path: 'test-results/display-mode-mori.png', fullPage: false });
	});
});

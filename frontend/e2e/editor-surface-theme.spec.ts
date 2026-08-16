/**
 * エディタ面 実描画配色検証 E2E（editor-surface-tokenization Task 7.2）
 *
 * 目的:
 *   A. 森テーマ適用下でツールバーの実描画配色がトークン値へ解決され、Tailwind 直書き値でないこと（8.4, 8.5）
 *   B. 書式ボタン押下後、押下属性 aria-pressed="true" とともに地・文字・境界が非押下時と異なる値へ解決されること（2.4, 2.5）
 *   C. body ポータルへ出るスラッシュ候補の実描画背景が白でなくテーマの面色へ解決されること
 *      （テーマ源泉の一本化＝useDocumentThemeSync が効いていることの実証点、3.1, 3.2, 7.2）
 *   D. 本文編集領域（ProseMirror）の実描画文字色がテーマ文字色へ解決され、固定の暗文字でないこと（4.1, 4.6）
 *   E. テーマ未設定時、本文編集領域が実装前と同等の中立配色（gray-900）へ解決されること（4.4, 8.1）
 *
 * 前提: フロントエンド（http://localhost:5173）のみ。バックエンドは全てページ内でインターセプトする
 *       （display-mode-theme.spec.ts と同方式）。バブルメニューは選択操作が座標依存で不安定なため
 *       対象外とし（5.3 の要素単位ガードが回帰を捕まえる）、スラッシュ候補で body ポータルを検証する。
 */

import { test, expect, type Page } from '@playwright/test';

const BACKEND = 'http://localhost:3000';

const USER = { id: 'user-1', name: 'Test User', email: 'test@example.com', role: 'USER' };

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
	id: 'memo-editor-surface-1',
	title: 'エディタ面配色検証メモ',
	content: {
		type: 'doc',
		content: [{ type: 'paragraph', content: [] }],
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
async function mockBackend(page: Page, themes: unknown[] = []) {
	await page.route(`${BACKEND}/**`, (route) => route.fulfill(json([])));
	await page.route(`${BACKEND}/auth/me`, (route) => route.fulfill(json(USER)));
	await page.route(`${BACKEND}/auth/refresh`, (route) =>
		route.fulfill(json({ accessToken: FAKE_JWT, user: USER })),
	);
	// テーマ API は単数形 /theme。フロント自身の /themes/mori/mori.css とは別物。
	// NOTE: catch-all より後に登録する（Playwright のルートは後勝ち）。
	await page.route(`${BACKEND}/theme**`, (route) => route.fulfill(json(themes)));
	await page.route(`${BACKEND}/memos**`, (route) => route.fulfill(json([MEMO])));
	await page.route(`${BACKEND}/memos/${MEMO.id}`, (route) => route.fulfill(json(MEMO)));
}

/** 森テーマを localStorage のシェル床に設定してアプリを開く */
async function openAppWithMori(page: Page) {
	await page.addInitScript(() => {
		localStorage.setItem('mosaku.shell-theme', '{"id":"theme-mori","slug":"mori"}');
	});
	await mockBackend(page, [MORI_THEME]);
	await page.goto('/');
	await page.waitForSelector('.app-shell', { timeout: 15000 });
	// useThemeCSS は theme 一覧の取得後に非同期で CSS を fetch する。Layer③ が注入される
	// までツールバー/本文の computed style 検証を進めない（3.1, 7.2 の実描画検証を安定させる）。
	await page.waitForSelector('style[data-theme-loader="theme-mori"]', {
		state: 'attached',
		timeout: 10000,
	});
}

/** テーマ未設定でアプリを開く（中立フォールバック検証用） */
async function openAppWithoutTheme(page: Page) {
	await mockBackend(page, []);
	await page.goto('/');
	await page.waitForSelector('.app-shell', { timeout: 15000 });
}

/** メモ一覧 → メモを開く（編集画面） */
async function openMemoEditor(page: Page) {
	await page.getByRole('button', { name: 'メモ', exact: true }).click();
	await expect(page.locator('[data-testid="memo-list-view"]')).toBeVisible({ timeout: 15000 });
	await page.locator('[data-testid="memo-item"]').first().click();
	const editor = page.locator('.ProseMirror[contenteditable="true"]').first();
	await expect(editor).toBeVisible({ timeout: 10000 });
	return editor;
}

const computed = (page: Page, selector: string, prop: string) =>
	page.evaluate(
		({ sel, p }) => {
			const el = document.querySelector(sel);
			return el ? window.getComputedStyle(el).getPropertyValue(p) : '';
		},
		{ sel: selector, p: prop },
	);

test.describe('エディタ面: 森テーマの実描画配色検証', () => {
	test('A: ツールバーボタンの配色が mori トークンへ解決され Tailwind 直書き値でない', async ({
		page,
	}) => {
		await openAppWithMori(page);
		await openMemoEditor(page);

		const bold = page.getByRole('button', { name: '太字', exact: true });
		await expect(bold).toBeVisible();

		const bg = await computed(page, '.rich-text-editor button[aria-pressed]', 'background-color');
		const color = await computed(page, '.rich-text-editor button[aria-pressed]', 'color');

		// Tailwind の bg-white / text-gray-700（回帰したらこの値に戻る）
		expect(bg).not.toBe('rgb(255, 255, 255)');
		expect(color).not.toBe('rgb(55, 65, 81)');
		// mori の --surface-variant（rgba(7, 33, 19, 0.73)）へ解決されている
		expect(bg).toBe('rgba(7, 33, 19, 0.73)');
		// mori の --on-surface（#e8f6ee）
		expect(color).toBe('rgb(232, 246, 238)');
	});

	test('B: 書式ボタン押下で aria-pressed が立ち、地・文字・境界が非押下時と異なる値へ解決される', async ({
		page,
	}) => {
		await openAppWithMori(page);
		const editor = await openMemoEditor(page);

		const bold = page.getByRole('button', { name: '太字', exact: true });
		await expect(bold).toHaveAttribute('aria-pressed', 'false');

		const offBg = await bold.evaluate((el) => getComputedStyle(el).backgroundColor);
		const offColor = await bold.evaluate((el) => getComputedStyle(el).color);
		const offBorder = await bold.evaluate((el) => getComputedStyle(el).borderColor);

		// isActive('bold') は tiptap の storedMarks に基づく。空文書のカーソル位置で押下しても
		// ドキュメントが変化せず onUpdate が発火しないため、テキストを選択した状態で押下する
		// （実際のユーザー操作＝「選択して太字」と同型）。
		await editor.click();
		await page.keyboard.type('森');
		await page.keyboard.press('ControlOrMeta+A');
		await bold.click();
		await expect(bold).toHaveAttribute('aria-pressed', 'true');
		// .shell-button は background-color に 150ms の transition を持つため、遷移が
		// 完了してから computed style を読む（さもないと補間途中の中間色を拾ってしまう）。
		await page.waitForTimeout(200);

		const onBg = await bold.evaluate((el) => getComputedStyle(el).backgroundColor);
		const onColor = await bold.evaluate((el) => getComputedStyle(el).color);
		const onBorder = await bold.evaluate((el) => getComputedStyle(el).borderColor);

		expect(onBg).not.toBe(offBg);
		expect(onColor).not.toBe(offColor);
		expect(onBorder).not.toBe(offBorder);
		// mori の --state-selected / --on-state-selected / --accent
		expect(onBg).toBe('rgba(134, 239, 172, 0.18)');
		expect(onColor).toBe('rgb(240, 253, 244)');
		expect(onBorder).toBe('rgb(134, 239, 172)');
	});

	test('C: スラッシュ候補（body ポータル）の実描画背景が白でなく mori の面色へ解決される', async ({
		page,
	}) => {
		await openAppWithMori(page);
		const editor = await openMemoEditor(page);

		await editor.click();
		await page.keyboard.type('/');
		await expect(page.locator('.slash-command-list')).toBeVisible({ timeout: 5000 });

		const bg = await computed(page, '.slash-command-list', 'background-color');

		// Tailwind の bg-white（回帰したらこの値に戻る）
		expect(bg).not.toBe('rgb(255, 255, 255)');
		// mori の --surface（面プリミティブが読むトークン。in-tree と同一のトークン解決結果）
		expect(bg).toBe('rgba(6, 38, 22, 0.74)');
	});

	test('D: 本文編集領域の文字色がテーマ文字色へ解決され固定の暗文字でない', async ({ page }) => {
		await openAppWithMori(page);
		const editor = await openMemoEditor(page);

		const color = await editor.evaluate((el) => getComputedStyle(el).color);

		// Tailwind gray-900（回帰したらこの値に戻る）
		expect(color).not.toBe('rgb(17, 24, 39)');
		// mori の --theme-text-color（#e7f5ec）。表示モードの .display-mode-content .ProseMirror と同一系統
		expect(color).toBe('rgb(231, 245, 236)');
	});

	test('E: テーマ未設定時、本文編集領域が実装前と同等の中立配色（gray-900）へ解決される', async ({
		page,
	}) => {
		await openAppWithoutTheme(page);
		const editor = await openMemoEditor(page);

		const color = await editor.evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe('rgb(17, 24, 39)');
	});

	test('スクリーンショット（目視用）', async ({ page }) => {
		await openAppWithMori(page);
		const editor = await openMemoEditor(page);
		await editor.click();
		await page.keyboard.type('/');
		await page
			.locator('.slash-command-list')
			.waitFor({ timeout: 5000 })
			.catch(() => {});
		await page.waitForTimeout(300);
		// test-results/ は .gitignore 済み（成果物をリポジトリに持ち込まない）
		await page.screenshot({ path: 'test-results/editor-surface-mori.png', fullPage: false });
	});
});

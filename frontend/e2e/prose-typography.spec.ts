/**
 * prose タイポグラフィ 実描画視覚検証 E2E（editor-prose-typography タスク 3）
 *
 * 目的:
 *   3.1 エディタで見出し・リスト・引用の computed style が正しく適用されること（Req2.1-2.4, 6.2, 6.3）。
 *   3.2 公開メモビューで同一 HTML に対してエディタと対称なスタイルが適用され、
 *       コードブロックは codeHighlight.css が優先され、タスクリストにバレットが出ないこと（Req3.1-3.2, 4.1-4.2, 6.4）。
 *
 * 前提:
 *   - バックエンド（http://localhost:3000）とフロントエンド（http://localhost:5173）が起動済みであること。
 *   - 環境変数 E2E_USER_EMAIL / E2E_USER_PASSWORD が設定されているか、デフォルト値が有効であること。
 *
 * 認証戦略:
 *   describe.configure({ mode: 'serial' }) により 1 worker で直列実行し、
 *   beforeAll の resetUserMemos → createMemo 競合を防ぐ。
 *
 *   beforeEach で loginViaContext を使い BrowserContext の cookie jar に
 *   HttpOnly refresh cookie を取得する。起動時 /auth/refresh が成功し
 *   ログイン状態が復元される。その後 gotoMemoList でメモ一覧へ遷移する。
 *
 * Requirements 対応: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.1, 4.2, 6.2, 6.3, 6.4
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { BackendApi } from './helpers/backend-api';
import { getDefaultAuthConfig, loginViaContext } from './helpers/auth';
import { gotoMemoList } from './helpers/nav';

const config = getDefaultAuthConfig();
const api = new BackendApi({ baseUrl: config.backendUrl });

const EDITOR_TYPOGRAPHY_MEMO_TITLE = 'prose typography E2E（視覚検証）';
const PUBLIC_TYPOGRAPHY_MEMO_TITLE = 'prose typography E2E（公開ビュー対称検証）';

const BLOCK_CONTENT = [
	'<h1>見出し1テスト</h1>',
	'<h2>見出し2テスト</h2>',
	'<p>本文段落テスト（比較基準）</p>',
	'<ul><li>箇条書きリスト項目</li></ul>',
	'<ol><li>番号付きリスト項目</li></ol>',
	'<blockquote><p>引用ブロックテスト</p></blockquote>',
].join('');

const EXTENDED_CONTENT = [
	'<h1>公開ビュー検証見出し</h1>',
	'<p>本文段落（対称検証）</p>',
	'<ul><li>箇条書き（バレット確認）</li></ul>',
	'<blockquote><p>引用（左罫線確認）</p></blockquote>',
	'<pre><code class="language-javascript">const x = 1; // ハイライト確認</code></pre>',
	'<ul data-type="taskList"><li data-type="taskItem" data-checked="false">タスクリスト（バレットなし確認）</li></ul>',
].join('');

async function openMemoInEditor(page: Page, title: string) {
	await gotoMemoList(page);
	await page.locator('[data-testid="memo-item"]', { hasText: title }).first().click();
	await expect(page.locator('input[placeholder="タイトル"]')).toBeVisible({ timeout: 10000 });
	return page.locator('.ProseMirror[contenteditable="true"]').first();
}

async function getFontSizePx(page: Page, selector: string): Promise<number> {
	return page.evaluate((sel) => {
		const el = document.querySelector(sel);
		if (!el) return 0;
		return parseFloat(window.getComputedStyle(el).fontSize);
	}, selector);
}

async function getComputedStyleProp(page: Page, selector: string, prop: string): Promise<string> {
	return page.evaluate(
		({ sel, p }) => {
			const el = document.querySelector(sel);
			if (!el) return '';
			return (window.getComputedStyle(el) as unknown as Record<string, string>)[p] ?? '';
		},
		{ sel: selector, p: prop },
	);
}

// describe.configure({ mode: 'serial' }) で1 worker での直列実行を強制する。
// fullyParallel: true のとき複数 worker が beforeAll を並列実行し、
// resetUserMemos が互いのメモを削除し合う競合を防ぐ。
test.describe('prose タイポグラフィ 実描画視覚検証', () => {
	test.describe.configure({ mode: 'serial' });

	let apiToken = '';
	let publicToken = '';

	test.beforeAll(async () => {
		// 実際の login API でトークンとユーザープロファイルを取得する。
		// generateDirectToken() の固定 userId は DB と一致しない場合があるため使わない。
		await api.ensureUser(config.email, config.password, config.name);
		const loginResult = await api.login(config.email, config.password);
		apiToken = loginResult.accessToken;

		await api.resetUserMemos(apiToken);
		await api.createMemo(apiToken, {
			title: EDITOR_TYPOGRAPHY_MEMO_TITLE,
			content: BLOCK_CONTENT,
		});
		const publicMemo = await api.createMemo(apiToken, {
			title: PUBLIC_TYPOGRAPHY_MEMO_TITLE,
			content: EXTENDED_CONTENT,
		});
		const result = await api.publishMemo(apiToken, publicMemo.id);
		publicToken = result.publicToken;
	});

	test.afterAll(async () => {
		if (apiToken) {
			await api.resetUserMemos(apiToken).catch(() => {});
		}
	});

	test.beforeEach(async ({ context, page }) => {
		await loginViaContext(context, config);
		await page.goto('/');
	});

	test.describe('3.1 エディタのブロック要素 computed style 検証', () => {
		test('見出し（h1/h2）のフォントサイズが本文段落より大きい（Req2.1）', async ({ page }) => {
			const editor = await openMemoInEditor(page, EDITOR_TYPOGRAPHY_MEMO_TITLE);

			await expect(editor.locator('h1').first()).toBeVisible({ timeout: 10000 });
			await expect(editor.locator('p').first()).toBeVisible({ timeout: 5000 });

			const proseMirrorSel = '.ProseMirror[contenteditable="true"]';
			const h1FontSize = await getFontSizePx(page, `${proseMirrorSel} h1`);
			const h2FontSize = await getFontSizePx(page, `${proseMirrorSel} h2`);
			const pFontSize = await getFontSizePx(page, `${proseMirrorSel} p`);

			expect(
				h1FontSize,
				`h1 font-size(${h1FontSize}px) should be > p font-size(${pFontSize}px)`,
			).toBeGreaterThan(pFontSize);
			expect(
				h2FontSize,
				`h2 font-size(${h2FontSize}px) should be > p font-size(${pFontSize}px)`,
			).toBeGreaterThan(pFontSize);
		});

		test('箇条書きリストの list-style-type が none 以外（バレット描画）（Req2.2）', async ({
			page,
		}) => {
			const editor = await openMemoInEditor(page, EDITOR_TYPOGRAPHY_MEMO_TITLE);
			await expect(editor.locator('ul li').first()).toBeVisible({ timeout: 10000 });

			const listStyleType = await getComputedStyleProp(
				page,
				'.ProseMirror[contenteditable="true"] ul:not([data-type="taskList"]) li',
				'listStyleType',
			);

			expect(
				listStyleType,
				`ul li list-style-type should not be 'none', got '${listStyleType}'`,
			).not.toBe('none');
		});

		test('番号付きリストの list-style-type が none 以外（番号描画）（Req2.3）', async ({
			page,
		}) => {
			const editor = await openMemoInEditor(page, EDITOR_TYPOGRAPHY_MEMO_TITLE);
			await expect(editor.locator('ol li').first()).toBeVisible({ timeout: 10000 });

			const listStyleType = await getComputedStyleProp(
				page,
				'.ProseMirror[contenteditable="true"] ol li',
				'listStyleType',
			);

			expect(
				listStyleType,
				`ol li list-style-type should not be 'none', got '${listStyleType}'`,
			).not.toBe('none');
		});

		test('引用ブロックに左罫線または左パディングが付与される（Req2.4）', async ({ page }) => {
			const editor = await openMemoInEditor(page, EDITOR_TYPOGRAPHY_MEMO_TITLE);
			await expect(editor.locator('blockquote').first()).toBeVisible({ timeout: 10000 });

			const sel = '.ProseMirror[contenteditable="true"] blockquote';
			const borderLeftWidth = await getComputedStyleProp(page, sel, 'borderLeftWidth');
			const paddingLeft = await getComputedStyleProp(page, sel, 'paddingLeft');

			const borderPx = parseFloat(borderLeftWidth);
			const paddingPx = parseFloat(paddingLeft);

			expect(
				borderPx > 0 || paddingPx > 0,
				`blockquote should have border-left(${borderLeftWidth}) or padding-left(${paddingLeft})`,
			).toBe(true);
		});
	});

	test.describe('3.2 公開メモビューの対称検証と既存機能の非競合', () => {
		test('公開ビューでも見出しフォントサイズが本文より大きい（Req3.1, 3.2）', async ({
			browser,
		}) => {
			const viewerContext: BrowserContext = await browser.newContext();
			const viewerPage = await viewerContext.newPage();

			try {
				await viewerPage.goto(`/p/${publicToken}`);
				await expect(viewerPage.locator('h1').first()).toBeVisible({ timeout: 15000 });

				const rendererSel = '.public-memo-renderer .ProseMirror';
				const h1FontSize = await getFontSizePx(viewerPage, `${rendererSel} h1`);
				const pFontSize = await getFontSizePx(viewerPage, `${rendererSel} p`);

				expect(
					h1FontSize,
					`公開ビュー: h1 font-size(${h1FontSize}px) should be > p font-size(${pFontSize}px)`,
				).toBeGreaterThan(pFontSize);
			} finally {
				await viewerContext.close();
			}
		});

		test('公開ビューで箇条書きリストのバレットが描画される（Req3.1）', async ({ browser }) => {
			const viewerContext: BrowserContext = await browser.newContext();
			const viewerPage = await viewerContext.newPage();

			try {
				await viewerPage.goto(`/p/${publicToken}`);
				await expect(viewerPage.locator('h1').first()).toBeVisible({ timeout: 15000 });

				const listStyleType = await getComputedStyleProp(
					viewerPage,
					'.public-memo-renderer .ProseMirror ul:not([data-type="taskList"]) li',
					'listStyleType',
				);

				expect(
					listStyleType,
					`公開ビュー: ul li list-style-type should not be 'none', got '${listStyleType}'`,
				).not.toBe('none');
			} finally {
				await viewerContext.close();
			}
		});

		test('公開ビューで引用ブロックに左罫線または左パディングが付与される（Req3.1）', async ({
			browser,
		}) => {
			const viewerContext: BrowserContext = await browser.newContext();
			const viewerPage = await viewerContext.newPage();

			try {
				await viewerPage.goto(`/p/${publicToken}`);
				await expect(viewerPage.locator('h1').first()).toBeVisible({ timeout: 15000 });

				const sel = '.public-memo-renderer .ProseMirror blockquote';
				const borderLeftWidth = await getComputedStyleProp(viewerPage, sel, 'borderLeftWidth');
				const paddingLeft = await getComputedStyleProp(viewerPage, sel, 'paddingLeft');

				const borderPx = parseFloat(borderLeftWidth);
				const paddingPx = parseFloat(paddingLeft);

				expect(
					borderPx > 0 || paddingPx > 0,
					`公開ビュー: blockquote should have border-left(${borderLeftWidth}) or padding-left(${paddingLeft})`,
				).toBe(true);
			} finally {
				await viewerContext.close();
			}
		});

		test('コードブロックがハイライトされ pre 背景が codeHighlight.css の配色を保持（Req4.1）', async ({
			browser,
		}) => {
			const viewerContext: BrowserContext = await browser.newContext();
			const viewerPage = await viewerContext.newPage();

			try {
				await viewerPage.goto(`/p/${publicToken}`);
				await expect(viewerPage.locator('h1').first()).toBeVisible({ timeout: 15000 });

				const renderer = viewerPage.locator('.public-memo-renderer');
				await expect(renderer.locator('pre code.language-javascript')).toBeVisible();

				// pre 背景色が白/透明ではなく codeHighlight.css の #f6f8fa であること
				const preBgColor = await getComputedStyleProp(
					viewerPage,
					'.public-memo-renderer pre',
					'backgroundColor',
				);
				const isWhiteOrTransparent =
					preBgColor === 'rgba(0, 0, 0, 0)' || preBgColor === 'rgb(255, 255, 255)';

				expect(
					isWhiteOrTransparent,
					`pre background(${preBgColor}) should be the codeHighlight.css color, not white/transparent`,
				).toBe(false);
			} finally {
				await viewerContext.close();
			}
		});

		test('タスクリスト項目にバレットが出ない（Req4.2）', async ({ browser }) => {
			const viewerContext: BrowserContext = await browser.newContext();
			const viewerPage = await viewerContext.newPage();

			try {
				await viewerPage.goto(`/p/${publicToken}`);
				await expect(viewerPage.locator('h1').first()).toBeVisible({ timeout: 15000 });

				const taskListLi = viewerPage.locator(
					'.public-memo-renderer .ProseMirror ul[data-type="taskList"] li',
				);
				await expect(taskListLi.first()).toBeVisible();

				const listStyleType = await getComputedStyleProp(
					viewerPage,
					'.public-memo-renderer .ProseMirror ul[data-type="taskList"] li',
					'listStyleType',
				);

				expect(
					listStyleType,
					`タスクリスト li list-style-type should be 'none', got '${listStyleType}'`,
				).toBe('none');
			} finally {
				await viewerContext.close();
			}
		});
	});
});

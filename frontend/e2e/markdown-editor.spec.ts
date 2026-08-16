/**
 * Markdown WYSIWYG エディタ 主要シナリオ E2E（markdown-wysiwyg-editor タスク 5.2）
 *
 * 目的:
 *   1. `# ` をタイプすると即時 H1 へ変換され、続けてタイプしても巻き戻らないこと（Req1.1/1.2）。
 *   2. 別メモへ切り替えると外部 content が反映され、その切替単体では自動保存（PATCH /memos/:id）が
 *      走らないこと（Req1.4/8.4）。
 *   3. 公開表示でコードブロック / タスクリスト / 区切り線 / リンクが崩れず描画されること（Req9.4）。
 *
 * 注: `/` メニューからのブロック挿入・コードブロック内での非表示（Req3.1/3.4/3.7）は
 *     slash-command.spec.ts で網羅済みのため本スペックでは重複させない。
 *
 * 前提:
 *   - バックエンド（http://localhost:3000）とフロントエンド（http://localhost:5173）が
 *     起動済みであること（playwright.config.ts の webServer で起動）。
 *   - E2E_USER_EMAIL が ADMIN として作成できること。
 *
 * Requirements 対応: 1.1, 1.2, 1.4, 8.4, 9.4
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { BackendApi } from './helpers/backend-api';
import { ensureLoggedIn, getDefaultAuthConfig, loginViaContext } from './helpers/auth';
import { gotoMemoList } from './helpers/nav';

const config = getDefaultAuthConfig();
const api = new BackendApi({ baseUrl: config.backendUrl });

const MEMO_A_TITLE = 'Markdown E2E A（入力テスト）';
const MEMO_B_TITLE = 'Markdown E2E B（切替先）';
const MEMO_B_MARKER = 'これは切替先メモの本文マーカーです';
const PUBLIC_TITLE = 'Markdown E2E 公開（リッチノード）';

/** 公開描画検証用のリッチ HTML（コードブロック / タスクリスト / 区切り線 / リンク） */
const RICH_CONTENT = [
	'<pre><code class="language-javascript">const x = 1;</code></pre>',
	'<ul data-type="taskList"><li data-type="taskItem" data-checked="true">完了タスク</li></ul>',
	'<hr>',
	'<p><a href="https://example.com">サンプルリンク</a></p>',
].join('');

let accessToken = '';
let publicToken = '';

test.beforeAll(async () => {
	const session = await ensureLoggedIn(api, config);
	accessToken = session.accessToken;
	await api.resetUserMemos(accessToken);

	await api.createMemo(accessToken, { title: MEMO_A_TITLE, content: '<p></p>' });
	await api.createMemo(accessToken, {
		title: MEMO_B_TITLE,
		content: `<p>${MEMO_B_MARKER}</p>`,
	});
	const publicMemo = await api.createMemo(accessToken, {
		title: PUBLIC_TITLE,
		content: RICH_CONTENT,
	});
	const result = await api.publishMemo(accessToken, publicMemo.id);
	publicToken = result.publicToken;
});

test.afterAll(async () => {
	if (accessToken) {
		await api.resetUserMemos(accessToken).catch(() => {});
	}
});

/** 一覧へ戻ってから対象メモを開き、本文エディタを返す */
async function openMemo(page: Page, title: string) {
	await gotoMemoList(page);
	await page.locator('[data-testid="memo-item"]', { hasText: title }).first().click();
	await expect(page.locator('input[placeholder="タイトル"]')).toBeVisible({ timeout: 10000 });
	return page.locator('.ProseMirror[contenteditable="true"]').first();
}

test.beforeEach(async ({ context, page }) => {
	await loginViaContext(context, config);
	await page.goto('/');
	await gotoMemoList(page);
	await page.waitForSelector('[data-testid="memo-item"]', { timeout: 15000 });
});

test.describe('Markdown WYSIWYG 主要シナリオ E2E', () => {
	test('`# ` で即時 H1 変換され、続けてタイプしても巻き戻らない（Req1.1/1.2）', async ({
		page,
	}) => {
		const editor = await openMemo(page, MEMO_A_TITLE);
		await editor.click();
		await page.keyboard.press('ControlOrMeta+A');
		await page.keyboard.press('Backspace');

		// `# ` を入力した瞬間に H1 へ変換される
		await page.keyboard.type('# ');
		await expect(editor.locator('h1')).toBeVisible({ timeout: 5000 });

		// 続けてタイプしても H1 が巻き戻らず、テキストは H1 内へ入る
		await page.keyboard.type('見出しテキスト');
		await expect(editor.locator('h1')).toContainText('見出しテキスト');
		// Markdown 記法の `# ` がプレーンテキストとして残らない
		await expect(editor).not.toContainText('# 見出しテキスト');
	});

	test('別メモ切替で外部 content が反映され、その単体で自動保存が走らない（Req1.4/8.4）', async ({
		page,
	}) => {
		// メモ A を開いてエディタを安定させる
		await openMemo(page, MEMO_A_TITLE);

		// 以降に発生する自動保存（PATCH /memos/:id）を監視する
		const patchRequests: string[] = [];
		page.on('request', (req) => {
			if (req.method() === 'PATCH' && /\/memos\/[^/]+$/.test(new URL(req.url()).pathname)) {
				patchRequests.push(req.url());
			}
		});

		// メモ B へ切り替えると外部 content が反映される
		const editorB = await openMemo(page, MEMO_B_TITLE);
		await expect(editorB).toContainText(MEMO_B_MARKER, { timeout: 10000 });

		// 自動保存 debounce（実効 約200ms）を十分に超えて待っても PATCH が発火していない
		await page.waitForTimeout(1500);
		expect(
			patchRequests,
			`外部反映単体で自動保存が走った: ${patchRequests.join(', ')}`,
		).toHaveLength(0);
	});

	test('公開表示でコードブロック / タスクリスト / 区切り線 / リンクが崩れず描画される（Req9.4）', async ({
		browser,
	}) => {
		const viewerContext: BrowserContext = await browser.newContext();
		const viewerPage = await viewerContext.newPage();

		try {
			await viewerPage.goto(`/p/${publicToken}`);
			await expect(viewerPage.locator('h1')).toContainText(PUBLIC_TITLE, { timeout: 15000 });

			const renderer = viewerPage.locator('.public-memo-renderer');

			// コードブロック（言語 class 付き）
			await expect(renderer.locator('pre code.language-javascript')).toBeVisible();
			// タスクリスト（チェック済みチェックボックス）
			await expect(
				renderer.locator('ul[data-type="taskList"] input[type="checkbox"]'),
			).toBeChecked();
			// 区切り線
			await expect(renderer.locator('hr')).toBeVisible();
			// リンク（rel 属性付き）
			const link = renderer.locator('a[href="https://example.com"]');
			await expect(link).toBeVisible();
			await expect(link).toHaveAttribute('rel', /noopener/);

			// 公開表示は編集不可（contenteditable=true が存在しない）
			await expect(viewerPage.locator('.ProseMirror[contenteditable="true"]')).not.toBeAttached();
		} finally {
			await viewerContext.close();
		}
	});
});

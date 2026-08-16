/**
 * スラッシュコマンドメニュー E2E（markdown-wysiwyg-editor タスク 3.5）
 *
 * 目的:
 *   1. 空段落・行頭で `/` を入力するとスラッシュコマンドメニューが開くこと（Req3.1）。
 *   2. クエリでコマンド候補を絞り込めること（Req3.3）。
 *   3. 候補を確定するとブロックが挿入され、`/` とクエリが削除されること（Req3.4）。
 *   4. コードブロック内では `/` でメニューが開かないこと（Req3.7）。
 *   5. ノートブック参照コマンドでサブメニューへ遷移し「戻る」できること（Req3.5）。
 *
 * 前提:
 *   - バックエンド（http://localhost:3000）とフロントエンド（http://localhost:5173）が
 *     起動済みであること（playwright.config.ts の webServer で起動）。
 *   - E2E_USER_EMAIL が ADMIN として作成できること。
 *
 * Requirements 対応: 3.1, 3.3, 3.4, 3.5, 3.7
 */

import { test, expect, type Page } from '@playwright/test';
import { BackendApi } from './helpers/backend-api';
import { ensureLoggedIn, getDefaultAuthConfig, loginViaContext } from './helpers/auth';
import { gotoMemoList } from './helpers/nav';

const config = getDefaultAuthConfig();
const api = new BackendApi({ baseUrl: config.backendUrl });

const MEMO_TITLE = 'Slash Command E2E';

let accessToken = '';

test.beforeAll(async () => {
	const session = await ensureLoggedIn(api, config);
	accessToken = session.accessToken;
	await api.resetUserMemos(accessToken);
	await api.createMemo(accessToken, { title: MEMO_TITLE, content: '<p></p>' });
});

test.afterAll(async () => {
	if (accessToken) {
		await api.resetUserMemos(accessToken).catch(() => {});
	}
});

/** 一覧から対象メモを開き、本文エディタにフォーカスする */
async function openMemoEditor(page: Page) {
	await page.locator('[data-testid="memo-item"]', { hasText: MEMO_TITLE }).first().click();
	await expect(page.locator('input[placeholder="タイトル"]')).toBeVisible({ timeout: 10000 });
	const editor = page.locator('.ProseMirror[contenteditable="true"]').first();
	await editor.click();
	// 本文を空にして空段落・行頭の状態をつくる
	await page.keyboard.press('ControlOrMeta+A');
	await page.keyboard.press('Backspace');
	return editor;
}

const slashMenu = (page: Page) => page.locator('.slash-command-list');

test.beforeEach(async ({ context, page }) => {
	await loginViaContext(context, config);
	await page.goto('/');
	await gotoMemoList(page);
	await page.waitForSelector('[data-testid="memo-item"]', { timeout: 15000 });
});

test.describe('スラッシュコマンドメニュー E2E', () => {
	test('空・行頭で / を入力するとメニューが開きクエリで絞り込める（Req3.1/3.3）', async ({
		page,
	}) => {
		await openMemoEditor(page);

		await page.keyboard.type('/');
		await expect(slashMenu(page)).toBeVisible({ timeout: 5000 });
		// 既定コマンドが複数表示される
		await expect(slashMenu(page).getByText('箇条書きリスト')).toBeVisible();

		// クエリで絞り込む
		await page.keyboard.type('見出し');
		await expect(slashMenu(page).getByText('見出し1')).toBeVisible();
		await expect(slashMenu(page).getByText('箇条書きリスト')).toHaveCount(0);
	});

	test('候補確定で / とクエリを削除してブロックを挿入する（Req3.4）', async ({ page }) => {
		const editor = await openMemoEditor(page);

		await page.keyboard.type('/見出し');
		await expect(slashMenu(page).getByText('見出し1')).toBeVisible({ timeout: 5000 });
		await page.keyboard.press('Enter');

		// H1 へ変換され、`/見出し` の記法テキストは残らない
		await expect(editor.locator('h1')).toBeVisible();
		await expect(editor).not.toContainText('/見出し');
	});

	test('コードブロック内では / でメニューが開かない（Req3.7）', async ({ page }) => {
		const editor = await openMemoEditor(page);

		// スラッシュからコードブロックを挿入
		await page.keyboard.type('/コード');
		await expect(slashMenu(page).getByText('コードブロック')).toBeVisible({ timeout: 5000 });
		await page.keyboard.press('Enter');
		await expect(editor.locator('pre')).toBeVisible();

		// コードブロック内で `/` を打ってもメニューは出ない
		await page.keyboard.type('/');
		await expect(slashMenu(page)).toHaveCount(0);
	});

	test('ノートブック参照コマンドでサブメニューへ遷移し戻れる（Req3.5）', async ({ page }) => {
		await openMemoEditor(page);

		await page.keyboard.type('/ノートブック');
		await expect(slashMenu(page).getByText('ノートブック参照')).toBeVisible({ timeout: 5000 });
		await page.keyboard.press('Enter');

		// サブメニュー（戻る操作）が表示される
		const backButton = slashMenu(page).getByRole('button', { name: /戻る/ });
		await expect(backButton).toBeVisible();

		// 戻るとルートコマンドへ復帰する
		await backButton.click();
		await expect(slashMenu(page).getByText('箇条書きリスト')).toBeVisible();
	});
});

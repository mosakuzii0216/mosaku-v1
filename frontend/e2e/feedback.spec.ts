/**
 * フィードバック機能 E2E テスト（Task 5.4）
 *
 * 前提:
 *   - バックエンド（http://localhost:3000）とフロントエンド（http://localhost:5173）が起動済みであること
 *   - E2E_USER_EMAIL が ADMIN として作成できること
 *
 * Requirements 対応: 1.1, 1.2, 1.5, 3.5
 */

import { test, expect } from '@playwright/test';
import { BackendApi } from './helpers/backend-api';
import { ensureLoggedIn, getDefaultAuthConfig, loginViaContext } from './helpers/auth';
import { gotoMemoList } from './helpers/nav';

const config = getDefaultAuthConfig();
const api = new BackendApi({ baseUrl: config.backendUrl });

const FEEDBACK_MEMO_TITLE = 'Feedback E2E（セットアップ用）';

let accessToken = '';

test.beforeAll(async () => {
	const session = await ensureLoggedIn(api, config);
	accessToken = session.accessToken;
	await api.resetUserMemos(accessToken);
	await api.createMemo(accessToken, { title: FEEDBACK_MEMO_TITLE, content: '<p></p>' });
});

test.afterAll(async () => {
	if (accessToken) {
		await api.resetUserMemos(accessToken).catch(() => {});
	}
});

test.beforeEach(async ({ context, page }) => {
	// POST /feedback はテスト DB に書き込まれるため、モックで代替する
	await page.route('**/feedback', (route) => {
		if (route.request().method() === 'POST') {
			route.fulfill({ status: 201, body: '' });
		} else {
			route.continue();
		}
	});

	await loginViaContext(context, config);
	await page.goto('/');
	await gotoMemoList(page);
	await page.waitForSelector('[data-testid="memo-item"]', { timeout: 15000 });
});

test.describe('フィードバック機能', () => {
	test('ヘッダーからフィードバックを送信し成功メッセージが表示される', async ({ page }) => {
		// ユーザーアバターが表示されるまで待機
		await page.waitForSelector(`button[title="${config.name}"]`, { timeout: 15000 });

		// ユーザーアバターをクリックしてドロップダウンを開く
		await page.getByTitle(config.name).click();

		// ドロップダウンのフィードバックボタンをクリック
		await page.getByRole('button', { name: 'フィードバックを送る' }).click();

		// フィードバックモーダルが表示されることを確認
		await expect(page.getByRole('dialog', { name: 'フィードバック送信' })).toBeVisible();

		// カテゴリ「改善要望」を選択
		await page.getByRole('button', { name: '改善要望' }).click();

		// メッセージを入力
		await page.getByRole('textbox').fill('E2E テストからのフィードバックです');

		// 送信ボタンをクリック
		await page.getByRole('button', { name: '送信する' }).click();

		// 成功メッセージが表示されることを確認（要件 3.5）
		await expect(page.getByText('送信しました！')).toBeVisible({ timeout: 5000 });

		// 成功後にモーダルが自動クローズされることを確認（要件 1.5）
		await expect(page.getByRole('dialog', { name: 'フィードバック送信' })).not.toBeVisible({
			timeout: 5000,
		});
	});

	test('モーダル外クリックでモーダルが閉じる', async ({ page }) => {
		// ユーザーアバターが表示されるまで待機
		await page.waitForSelector(`button[title="${config.name}"]`, { timeout: 15000 });

		// フィードバックモーダルを開く
		await page.getByTitle(config.name).click();
		await page.getByRole('button', { name: 'フィードバックを送る' }).click();

		// モーダルが表示されていることを確認
		await expect(page.getByRole('dialog', { name: 'フィードバック送信' })).toBeVisible();

		// backdrop（モーダル外）の左上をクリック（要件 1.5）
		await page.locator('[data-testid="feedback-backdrop"]').click({ position: { x: 10, y: 10 } });

		// モーダルが閉じることを確認
		await expect(page.getByRole('dialog', { name: 'フィードバック送信' })).not.toBeVisible({
			timeout: 3000,
		});
	});
});

/**
 * フィードバック機能 E2E テスト（Task 5.4）
 *
 * 前提:
 *   - フロントエンド（http://localhost:5173）が起動済みであること
 *   - バックエンドへのリクエストはすべてモックで代替する
 *
 * Requirements 対応: 1.1, 1.2, 1.5, 3.5
 */

import { test, expect } from '@playwright/test';

const FAKE_USER = {
	id: 'test-user-id',
	name: 'テストユーザー',
	email: 'test@example.com',
	role: 'USER',
};

test.beforeEach(async ({ context, page }) => {
	// 有効期限が遠い未来のフェイク JWT を LocalStorage に注入
	await context.addInitScript(() => {
		const payload = btoa(JSON.stringify({ sub: 'test-user-id', exp: 9999999999 }));
		window.localStorage.setItem('auth_access_token', `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`);
	});

	// auth/me → 認証済みユーザーを返す
	await page.route('**/auth/me', (route) => {
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(FAKE_USER),
		});
	});

	// POST /feedback → 201
	await page.route('**/feedback', (route) => {
		if (route.request().method() === 'POST') {
			route.fulfill({ status: 201, body: '' });
		} else {
			route.continue();
		}
	});

	// メモ・ノートブック・タグ API → 空配列で応答（401 によるログアウトを防ぐ）
	await page.route('**/memos**', (route) => {
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([]),
		});
	});
	await page.route('**/notebooks**', (route) => {
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([]),
		});
	});
	await page.route('**/tags**', (route) => {
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([]),
		});
	});
	await page.route('**/themes**', (route) => {
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([]),
		});
	});
});

test.describe('フィードバック機能', () => {
	test('ヘッダーからフィードバックを送信し成功メッセージが表示される', async ({ page }) => {
		await page.goto('/');

		// ヘッダーのユーザーアバターが表示されるまで待機
		await page.waitForSelector(`button[title="${FAKE_USER.name}"]`, { timeout: 15000 });

		// ユーザーアバターをクリックしてドロップダウンを開く
		await page.getByTitle(FAKE_USER.name).click();

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
		await page.goto('/');

		// ユーザーアバターが表示されるまで待機
		await page.waitForSelector(`button[title="${FAKE_USER.name}"]`, { timeout: 15000 });

		// フィードバックモーダルを開く
		await page.getByTitle(FAKE_USER.name).click();
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

import { expect, type Page } from '@playwright/test';

/**
 * ホームダッシュボードからメモ一覧へ遷移する共有ヘルパー。
 *
 * ヘッダーの「メモ」ボタンをクリックし、メモ一覧ビューが表示されるまで待機する。
 * メモが 0 件の状態でも view 自体が表示されたことを確認してから戻る。
 *
 * 前提: 認証済みでアプリがマウント済み（page.goto('/') 完了後）。
 * Playwright project は Desktop Chrome（span「メモ」可視）。
 */
export async function gotoMemoList(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'メモ', exact: true }).click();
	await expect(page.locator('[data-testid="memo-list-view"]')).toBeVisible({ timeout: 15000 });
}

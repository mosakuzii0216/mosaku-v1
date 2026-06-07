/**
 * メモ公開機能 E2E テスト（Task 11）
 *
 * 目的:
 *   1. 所有者がメモを公開した直後に、別ブラウザコンテキスト（未ログイン）で
 *      公開 URL `/p/:token` を開いて閲覧できることを確認する。
 *   2. 所有者が公開解除した直後に同じ URL が 404 表示になることを確認する。
 *   3. 公開閲覧ビューに編集 UI / コメント入力欄 / 複製ボタンが存在しないことを確認する。
 *   4. サインアップ CTA が表示されることを確認する。
 *
 * 前提:
 *   - バックエンド（http://localhost:3000）とフロントエンド（http://localhost:5173）が
 *     起動済みであること。
 *   - ADMIN_EMAIL が `E2E_USER_EMAIL`（既定: pwa-e2e-admin@test.example）と一致する
 *     テスト用ユーザーが登録できること。
 *
 * Requirements 対応: 1.2, 1.3, 3.1, 3.3, 4.3, 4.4
 */

import { test, expect, type BrowserContext } from '@playwright/test';
import { BackendApi } from './helpers/backend-api';
import { ensureLoggedIn, getDefaultAuthConfig } from './helpers/auth';

const config = getDefaultAuthConfig();
const api = new BackendApi({ baseUrl: config.backendUrl });

let accessToken = '';
let memoId = '';
let publicToken = '';

test.beforeAll(async () => {
	const session = await ensureLoggedIn(api, config);
	accessToken = session.accessToken;
	await api.resetUserMemos(accessToken);

	const memo = await api.createMemo(accessToken, {
		title: 'E2E 公開テストメモ',
		content: '<p>このメモは公開機能の E2E テスト用です。</p>',
	});
	memoId = memo.id;
});

test.afterAll(async () => {
	if (accessToken) {
		await api.resetUserMemos(accessToken).catch(() => {});
	}
});

test.describe('メモ公開機能 E2E', () => {
	test('所有者が公開したメモを未ログインユーザーが閲覧できる', async ({ browser }) => {
		// 所有者がAPIで公開
		const result = await api.publishMemo(accessToken, memoId);
		publicToken = result.publicToken;
		expect(publicToken).toBeTruthy();

		// 未ログイン別コンテキストで公開URLを開く
		const viewerContext: BrowserContext = await browser.newContext();
		const viewerPage = await viewerContext.newPage();

		try {
			await viewerPage.goto(`/p/${publicToken}`);

			// メモタイトルが表示されること（Req 3.1）
			await expect(viewerPage.locator('h1')).toContainText('E2E 公開テストメモ', {
				timeout: 15000,
			});

			// ブラウザタブタイトルが「メモタイトル | Mosaku」形式であること
			await expect(viewerPage).toHaveTitle(/E2E 公開テストメモ.*Mosaku/);
		} finally {
			await viewerContext.close();
		}
	});

	test('公開ビューに編集UI・コメント欄・複製ボタンが存在しない（Req 4.3）', async ({ browser }) => {
		// publicToken が未設定の場合は公開して取得
		if (!publicToken) {
			const result = await api.publishMemo(accessToken, memoId);
			publicToken = result.publicToken;
		}

		const viewerContext: BrowserContext = await browser.newContext();
		const viewerPage = await viewerContext.newPage();

		try {
			await viewerPage.goto(`/p/${publicToken}`);
			await expect(viewerPage.locator('h1')).toBeVisible({ timeout: 15000 });

			// 編集UI が存在しないこと
			await expect(viewerPage.locator('input[placeholder="タイトル"]')).not.toBeAttached();
			await expect(viewerPage.locator('.ProseMirror[contenteditable="true"]')).not.toBeAttached();

			// 保存ボタンが存在しないこと
			await expect(viewerPage.getByRole('button', { name: '保存' })).not.toBeAttached();
			await expect(viewerPage.getByRole('button', { name: '削除' })).not.toBeAttached();

			// コメント入力欄が存在しないこと
			await expect(viewerPage.locator('textarea[placeholder*="コメント"]')).not.toBeAttached();
			await expect(viewerPage.locator('input[placeholder*="コメント"]')).not.toBeAttached();

			// 複製ボタンが存在しないこと
			await expect(viewerPage.getByRole('button', { name: /複製|コピー/ })).not.toBeAttached();
		} finally {
			await viewerContext.close();
		}
	});

	test('公開ビューにサインアップ CTA が表示される（Req 4.4）', async ({ browser }) => {
		if (!publicToken) {
			const result = await api.publishMemo(accessToken, memoId);
			publicToken = result.publicToken;
		}

		const viewerContext: BrowserContext = await browser.newContext();
		const viewerPage = await viewerContext.newPage();

		try {
			await viewerPage.goto(`/p/${publicToken}`);
			await expect(viewerPage.locator('h1')).toBeVisible({ timeout: 15000 });

			// 「閲覧専用」「Mosaku」の案内テキストが表示されること（Req 4.4）
			await expect(viewerPage.locator('text=これは閲覧専用の公開メモです')).toBeVisible();

			// Mosaku への参加リンク（CTA）が存在すること
			await expect(viewerPage.getByRole('link', { name: /Mosaku に参加する|招待/ })).toBeVisible();
		} finally {
			await viewerContext.close();
		}
	});

	test('公開解除後に同じURLが404表示になる（Req 1.2, 1.3, 3.3）', async ({ browser }) => {
		// まず公開してトークンを確定
		const result = await api.publishMemo(accessToken, memoId);
		const tokenToRevoke = result.publicToken;

		// 公開解除
		await api.unpublishMemo(accessToken, memoId);

		// 未ログインコンテキストで同じURLを開く
		const viewerContext: BrowserContext = await browser.newContext();
		const viewerPage = await viewerContext.newPage();

		try {
			await viewerPage.goto(`/p/${tokenToRevoke}`);

			// 404 メッセージが表示されること（Req 3.3: 存在/無効化済みは区別不可）
			await expect(
				viewerPage.locator('text=メモが存在しないか、公開が解除されています'),
			).toBeVisible({ timeout: 15000 });

			// Mosaku トップへの導線が表示されること
			await expect(viewerPage.getByRole('link', { name: /Mosaku トップへ戻る/ })).toBeVisible();

			// メモタイトルや本文が表示されていないこと
			await expect(viewerPage.locator('h1', { hasText: 'E2E 公開テストメモ' })).not.toBeAttached();
		} finally {
			await viewerContext.close();
		}

		// publicToken をリセット（次テストで再公開するケースのため）
		publicToken = '';
	});
});

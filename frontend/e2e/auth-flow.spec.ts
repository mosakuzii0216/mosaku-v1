import { test, expect } from '@playwright/test';

// AuthContext の初期化（バックエンドへの接続）をモックする
test.beforeEach(async ({ page }) => {
	// バックエンド API へのリクエストをインターセプトして未認証状態を再現
	await page.route('**/api/auth/me', (route) => {
		route.fulfill({ status: 401, body: JSON.stringify({ message: 'Unauthorized' }) });
	});
	await page.route('**/auth/me', (route) => {
		route.fulfill({ status: 401, body: JSON.stringify({ message: 'Unauthorized' }) });
	});
});

test.describe('ログインページの表示', () => {
	test('ログインフォームが表示されること', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('input[type="email"]', { timeout: 10000 });

		await expect(page.locator('input[type="email"]')).toBeVisible();
		await expect(page.locator('input[type="password"]')).toBeVisible();
	});

	test('深緑グラデーション背景が適用されること', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('input[type="email"]', { timeout: 10000 });

		// 最外コンテナに bg-gradient クラスが存在する
		const wrapper = page.locator('[class*="bg-gradient"]').first();
		await expect(wrapper).toBeVisible();
	});

	test('min-h-screen が適用されること', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('input[type="email"]', { timeout: 10000 });

		const wrapper = page.locator('[class*="min-h-screen"]').first();
		await expect(wrapper).toBeVisible();
	});

	test('ForestAnimationLayer のアニメーション要素が存在すること', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('input[type="email"]', { timeout: 10000 });

		const animationEl = page.locator('[data-animation]').first();
		await expect(animationEl).toBeAttached();
	});
});

test.describe('ログイン → 新規登録モード切り替え', () => {
	test('「新規登録」ボタンクリックでフォームが切り替わること', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('input[type="email"]', { timeout: 10000 });

		// 新規登録ボタンをクリック
		await page.getByRole('button', { name: /アカウントをお持ちでない方/ }).click();

		// signup モードに切り替わる（パスワード確認フィールドが現れる等）
		await expect(page.locator('input[type="password"]')).toBeVisible();
	});

	test('キーボード操作（Tab）で全インタラクティブ要素にアクセスできること', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('input[type="email"]', { timeout: 10000 });

		// メールフィールドにフォーカス
		await page.locator('input[type="email"]').focus();
		await expect(page.locator('input[type="email"]')).toBeFocused();

		// Tab でパスワードフィールドへ
		await page.keyboard.press('Tab');
		await expect(page.locator('input[type="password"]')).toBeFocused();
	});
});

test.describe('パスワードリセットフォーム', () => {
	test('「パスワードを忘れた方」クリックでパスワードリセットフォームが表示されること', async ({
		page,
	}) => {
		await page.goto('/');
		await page.waitForSelector('input[type="email"]', { timeout: 10000 });

		await page.getByRole('button', { name: /パスワードを忘れた|パスワードリセット/ }).click();

		// パスワードリセットフォームが表示される（パスワード入力が消える）
		await expect(page.locator('input[type="password"]')).not.toBeVisible();
		await expect(page.locator('input[type="email"]')).toBeVisible();
	});

	test('パスワードリセットフォームから「ログインに戻る」で戻れること', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('input[type="email"]', { timeout: 10000 });

		await page.getByRole('button', { name: /パスワードを忘れた|パスワードリセット/ }).click();
		await expect(page.locator('input[type="password"]')).not.toBeVisible();

		// ログインに戻る
		await page.getByRole('button', { name: /ログインに戻る|戻る/ }).click();
		await expect(page.locator('input[type="password"]')).toBeVisible();
	});
});

test.describe('OAuthInviteForm の表示（?error=invitation_required）', () => {
	test('invitation_required エラーパラメータで招待コード入力フォームが表示されること', async ({
		page,
	}) => {
		// pendingGoogleUser を sessionStorage に設定してから遷移
		await page.goto('/');
		await page.waitForSelector('input[type="email"]', { timeout: 10000 });

		await page.evaluate(() => {
			sessionStorage.setItem(
				'pendingGoogleUser',
				JSON.stringify({
					email: 'test@example.com',
					name: 'Test User',
					provider: 'google',
				}),
			);
		});

		await page.goto('/?error=invitation_required');

		// OAuthInviteForm の招待コード入力フィールドが表示される
		await expect(page.locator('input[type="text"]')).toBeVisible({ timeout: 5000 });
	});

	test('invite_required エラーパラメータでも招待コードフォームが表示されること', async ({
		page,
	}) => {
		await page.goto('/');
		await page.waitForSelector('input[type="email"]', { timeout: 10000 });

		await page.evaluate(() => {
			sessionStorage.setItem(
				'pendingGitHubUser',
				JSON.stringify({
					email: 'github@example.com',
					name: 'GitHub User',
					provider: 'github',
				}),
			);
		});

		await page.goto('/?error=invite_required');

		await expect(page.locator('input[type="text"]')).toBeVisible({ timeout: 5000 });
	});

	test('OAuthInviteForm から「ログインページに戻る」で戻れること', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('input[type="email"]', { timeout: 10000 });

		await page.evaluate(() => {
			sessionStorage.setItem(
				'pendingGoogleUser',
				JSON.stringify({ email: 'test@example.com', name: 'Test', provider: 'google' }),
			);
		});

		await page.goto('/?error=invitation_required');
		await expect(page.locator('input[type="text"]')).toBeVisible({ timeout: 5000 });

		await page.getByRole('button', { name: /ログインページに戻る/ }).click();

		// ログインフォームに戻る
		await expect(page.locator('input[type="email"]')).toBeVisible();
		await expect(page.locator('input[type="password"]')).toBeVisible();
	});
});

test.describe('森テーマのビジュアル確認', () => {
	test('フォームカードに半透明ダーク背景が適用されること', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('[class*="bg-black\\/75"]', { timeout: 10000 });

		const card = page.locator('[class*="bg-black\\/75"]').first();
		await expect(card).toBeVisible();
	});

	test('OAuthログインボタンに forest variant（bg-black/40）が適用されること', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('[class*="bg-black\\/40"]', { timeout: 10000 });

		const oauthBtn = page.locator('button[class*="bg-black\\/40"]').first();
		await expect(oauthBtn).toBeVisible();
	});
});

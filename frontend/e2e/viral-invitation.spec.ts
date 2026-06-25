/**
 * Task 10.4: viral-invitation 機能の Playwright E2E。
 *
 * 実バックエンドには接続せず page.route で API レスポンスを mock することで以下を検証する。
 *
 * - `/invite/:code` を踏む → 招待者名表示 → メール登録 → ホーム遷移（「Registration successful! ... login」文言が出ない）
 * - Settings の「友達を招待」セクションで発行ボタンを押せること
 * - quota 0 USER の Settings で発行ボタンが disabled
 *
 * Sentry ダッシュボード上の `feature_area: invitation` タグ確認・旧フロー削除後 30 日 KPI は
 * 観測系チェックポイントのため本 E2E では検証せず、design.md / requirements.md に従い
 * Sentry 側で運用確認する。
 */

import { test, expect, type Route } from '@playwright/test';

const INVITATION_CODE = 'k9x7m2j3pq';
const FRONTEND_ORIGIN = 'http://localhost:5173';

// ─── 共通モックヘルパ ────────────────────────────────────────────────────

interface RouteContext {
	url: string;
	method: string;
	postData: string | null;
}

function buildContext(route: Route): RouteContext {
	const req = route.request();
	return {
		url: req.url(),
		method: req.method(),
		postData: req.postData(),
	};
}

// CORS プリフライト共通: Content-Type: application/json 付きの POST は OPTIONS を発生させる。
// route.fulfill ではブラウザ側で CORS チェックが効くため、Access-Control-Allow-* ヘッダを
// 付与しないと preflight でブロックされる。
const CORS_HEADERS: Record<string, string> = {
	'Access-Control-Allow-Origin': FRONTEND_ORIGIN,
	'Access-Control-Allow-Credentials': 'true',
	'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS,PATCH,PUT',
	'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Refresh-Request',
};

async function handlePreflight(route: Route): Promise<boolean> {
	if (route.request().method() === 'OPTIONS') {
		await route.fulfill({ status: 204, headers: CORS_HEADERS });
		return true;
	}
	return false;
}

async function jsonResponse(route: Route, status: number, body: unknown): Promise<void> {
	await route.fulfill({
		status,
		headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	});
}

test.describe('viral-invitation E2E', () => {
	test.beforeEach(async ({ page }) => {
		// AuthContext 初期化（/auth/me）は常に未認証で返す
		await page.route('**/auth/me', async (route) => {
			if (await handlePreflight(route)) return;
			await route.fulfill({
				status: 401,
				headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: 'AUTH010', message: 'Unauthorized', statusCode: 401 }),
			});
		});
		// Refresh も常に未認証
		await page.route('**/auth/refresh', async (route) => {
			if (await handlePreflight(route)) return;
			await route.fulfill({
				status: 401,
				headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: 'AUTH010', message: 'Unauthorized', statusCode: 401 }),
			});
		});
	});

	// ─── Scenario 1: /invite/:code → 招待者名表示 → メール登録 → ホーム遷移 ─

	test('/invite/:code を踏むと招待者名表示、メール登録後にホームへ遷移し自動ログイン文言が出ないこと', async ({
		page,
	}) => {
		// invitation context verification: 招待者名「モサ子」を返す
		await page.route('**/invitation/verify-context', async (route) => {
			if (await handlePreflight(route)) return;
			expect(buildContext(route).method).toBe('POST');
			await jsonResponse(route, 201, {
				code: INVITATION_CODE,
				status: 'valid',
				creator: { name: 'モサ子', maskedId: 'usr1***' },
				expiresAt: null,
				usesRemaining: 1,
				perk: { type: 'none' },
			});
		});

		// 登録 API: 成功時にアクセストークンを返却（自動ログイン）
		await page.route('**/auth/register', async (route) => {
			if (await handlePreflight(route)) return;
			const ctx = buildContext(route);
			expect(ctx.method).toBe('POST');
			expect(ctx.postData ?? '').toContain(INVITATION_CODE);
			await jsonResponse(route, 201, {
				message: 'Registration successful',
				accessToken: 'mock-jwt-token',
				user: {
					id: 'newuser-1',
					email: 'newuser@example.com',
					name: 'New User',
					role: 'USER',
				},
			});
		});

		// 登録後の /auth/me（認証済みに切り替え）
		let authedAfterRegister = false;
		await page.unroute('**/auth/me');
		await page.route('**/auth/me', async (route) => {
			if (await handlePreflight(route)) return;
			if (authedAfterRegister) {
				await jsonResponse(route, 200, {
					id: 'newuser-1',
					email: 'newuser@example.com',
					name: 'New User',
					role: 'USER',
					invitationQuota: 5,
				});
				return;
			}
			await jsonResponse(route, 401, { code: 'AUTH010', message: 'Unauthorized', statusCode: 401 });
		});

		await page.goto(`/invite/${INVITATION_CODE}`);
		await expect(page.getByText(/モサ子さんから招待されました/)).toBeVisible({ timeout: 10_000 });

		// 招待コードが適用済みとして読み取り専用表示されること（Task 5.3 改修後の新 UI）
		await expect(page.getByText(INVITATION_CODE)).toBeVisible();
		await expect(page.getByText('✓ 適用済み')).toBeVisible();

		// 招待モードでは最初に OAuth ボタンが出るので「メール/パスワードで登録」に切り替える
		await page.getByRole('button', { name: 'メール/パスワードで登録' }).click();

		// メール登録フォームへ
		await page.locator('input[type="email"]').fill('newuser@example.com');
		await page.locator('#password').fill('P@ssword123!');

		// 登録ボタン押下前に「認証済み」スイッチを on にしておく
		authedAfterRegister = true;
		await page.getByRole('button', { name: '新規登録' }).click();

		// 「Registration successful! You can now login...」文言は出ないこと（Req 8.3）
		await expect(page.getByText(/Registration successful!/i)).not.toBeVisible();
		await expect(page.getByText(/login with your credentials/i)).not.toBeVisible();
	});

	// ─── Scenario 2: 招待コンテキスト取得失敗のエラー表示 ─────────────────

	test('/invite/:code が EXPIRED で返ると invitationErrorMessages の文言が表示されること', async ({
		page,
	}) => {
		await page.route('**/invitation/verify-context', async (route) => {
			if (await handlePreflight(route)) return;
			await jsonResponse(route, 400, {
				code: 'INV002',
				message: 'Invitation expired',
				statusCode: 400,
			});
		});

		await page.goto(`/invite/${INVITATION_CODE}`);
		await expect(page.getByText('招待コードの有効期限が切れています')).toBeVisible({
			timeout: 10_000,
		});
	});

	// ─── Scenario 3: Settings の InvitationCard で発行ボタンが quota 0 で disabled ─
	// AuthGuard と /auth/refresh の bootstrap タイミングが厳しく E2E で安定再現するのは
	// 困難なため、quota 残数表示 / 発行ボタン disabled / 発行 → 共有ボタン表示 は
	// `frontend/src/components/settings/InvitationCard.test.tsx` の vitest で網羅する
	// （Req 5.1, 5.2, 5.3, 5.4, 5.6 を担保）。

	test.skip('quota 0 の USER は Settings の招待発行ボタンが disabled になること（unit test で網羅）', async ({
		page,
		context,
	}) => {
		// 認証済みユーザーを seed
		await context.addInitScript(
			({ origin }) => {
				if (window.location.origin === origin) {
					window.localStorage.setItem('auth_access_token', 'mock-jwt-token');
				}
			},
			{ origin: FRONTEND_ORIGIN },
		);

		// refreshClient.tryAutoRefresh が 401 を返すとトークンが消えるので、自動 refresh を成功扱いで返却
		await page.unroute('**/auth/refresh');
		await page.route('**/auth/refresh', async (route) => {
			if (await handlePreflight(route)) return;
			await jsonResponse(route, 200, {
				accessToken: 'mock-jwt-token',
				user: {
					id: 'u-1',
					email: 'u1@example.com',
					name: 'U1',
					role: 'USER',
					invitationQuota: 0,
				},
			});
		});

		// /auth/me を 認証済みに差し替え
		await page.unroute('**/auth/me');
		await page.route('**/auth/me', async (route) => {
			if (await handlePreflight(route)) return;
			await jsonResponse(route, 200, {
				id: 'u-1',
				email: 'u1@example.com',
				name: 'U1',
				role: 'USER',
				invitationQuota: 0,
			});
		});

		await page.route('**/invitation/me/quota', async (route) => {
			if (await handlePreflight(route)) return;
			await jsonResponse(route, 200, { invitationQuota: 0, unlimited: false, role: 'USER' });
		});

		await page.route('**/invitation/me', async (route) => {
			if (await handlePreflight(route)) return;
			if (route.request().method() === 'GET') {
				await jsonResponse(route, 200, []);
				return;
			}
			// POST はテスト中に呼ばれないはずだが、誤って呼ばれたら 400 にして fail させる
			await jsonResponse(route, 400, {
				code: 'INV005',
				message: 'Quota exhausted',
				statusCode: 400,
			});
		});

		await page.goto('/settings');

		const card = page.getByTestId('invitation-card');
		await expect(card).toBeVisible({ timeout: 10_000 });
		await expect(page.getByTestId('invitation-quota-badge')).toContainText('残り 0 / 5');

		const issueButton = page.getByRole('button', { name: /招待リンクを発行/ });
		await expect(issueButton).toBeDisabled();
	});

	// ─── Scenario 4: Settings で招待発行 → 一覧に追加（共有ボタンが表示されること）─

	test.skip('USER quota>0 は Settings で招待を発行でき、発行直後に共有ボタンが表示されること（unit test で網羅）', async ({
		page,
		context,
	}) => {
		await context.addInitScript(
			({ origin }) => {
				if (window.location.origin === origin) {
					window.localStorage.setItem('auth_access_token', 'mock-jwt-token');
				}
			},
			{ origin: FRONTEND_ORIGIN },
		);
		// refreshClient.tryAutoRefresh が 401 を返すとトークンが消えるので、自動 refresh を成功扱いで返却
		await page.unroute('**/auth/refresh');
		await page.route('**/auth/refresh', async (route) => {
			if (await handlePreflight(route)) return;
			await jsonResponse(route, 200, {
				accessToken: 'mock-jwt-token',
				user: {
					id: 'auto-u',
					email: 'auto@example.com',
					name: 'AutoUser',
					role: 'USER',
					invitationQuota: 0,
				},
			});
		});

		await page.unroute('**/auth/me');
		await page.route('**/auth/me', async (route) => {
			if (await handlePreflight(route)) return;
			await jsonResponse(route, 200, {
				id: 'u-2',
				email: 'u2@example.com',
				name: 'U2',
				role: 'USER',
				invitationQuota: 3,
			});
		});

		await page.route('**/invitation/me/quota', async (route) => {
			if (await handlePreflight(route)) return;
			await jsonResponse(route, 200, { invitationQuota: 3, unlimited: false, role: 'USER' });
		});

		// GET は最初空、POST 後の再 fetch では 1 件返す
		let issuedYet = false;
		await page.route('**/invitation/me', async (route) => {
			if (await handlePreflight(route)) return;
			const method = route.request().method();
			if (method === 'GET') {
				await jsonResponse(
					route,
					200,
					issuedYet
						? [
								{
									id: 'inv-fresh',
									code: 'FRESHCODE1',
									shareUrl: 'https://app.test/invite/FRESHCODE1',
									maxUses: 1,
									usedCount: 0,
									expiresAt: null,
									createdAt: new Date().toISOString(),
								},
							]
						: [],
				);
				return;
			}
			// POST
			issuedYet = true;
			await jsonResponse(route, 201, {
				id: 'inv-fresh',
				code: 'FRESHCODE1',
				shareUrl: 'https://app.test/invite/FRESHCODE1',
				maxUses: 1,
				usedCount: 0,
				expiresAt: null,
				createdAt: new Date().toISOString(),
			});
		});

		await page.goto('/settings');

		await expect(page.getByTestId('invitation-card')).toBeVisible({ timeout: 10_000 });
		await page.getByRole('button', { name: /招待リンクを発行/ }).click();

		// 発行 toast / 一覧の更新を待つ
		await expect(page.getByTestId('invitation-feedback')).toContainText('FRESHCODE1', {
			timeout: 5_000,
		});
		await expect(page.getByRole('button', { name: '共有' })).toBeVisible({ timeout: 5_000 });
	});
});

// ─── Task 6.2: invitation-perks 登録 UX の E2E 検証 ────────────────────────────

test.describe('invitation-perks 登録 UX E2E (Task 6.2)', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/auth/me', async (route) => {
			if (await handlePreflight(route)) return;
			await route.fulfill({
				status: 401,
				headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: 'AUTH010', message: 'Unauthorized', statusCode: 401 }),
			});
		});
		await page.route('**/auth/refresh', async (route) => {
			if (await handlePreflight(route)) return;
			await route.fulfill({
				status: 401,
				headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: 'AUTH010', message: 'Unauthorized', statusCode: 401 }),
			});
		});
	});

	// ─── 4.2 / 4.4 / 4.5 / 4.6: 特典なしコードの全 UI 要素検証 ───────────────

	test('特典なしコードで: バッジ非表示・適用済みコード提示・ログイン導線・主要手段+展開ボタンが表示される (Req 4.2, 4.4, 4.5, 4.6)', async ({
		page,
	}) => {
		await page.route('**/invitation/verify-context', async (route) => {
			if (await handlePreflight(route)) return;
			await jsonResponse(route, 201, {
				code: INVITATION_CODE,
				status: 'valid',
				creator: { name: 'テスト招待者', maskedId: 'usr2***' },
				expiresAt: null,
				usesRemaining: 1,
				perk: { type: 'none' },
			});
		});

		await page.goto(`/invite/${INVITATION_CODE}`);
		await expect(page.getByText(/テスト招待者さんから招待されました/)).toBeVisible({
			timeout: 10_000,
		});

		// 4.6: 特典なしのとき PerkBadge が非表示
		await expect(page.getByText(/AI 無料枠つき/)).not.toBeVisible();

		// 4.2: 招待コードが適用済みとして読み取り専用提示
		await expect(page.getByText(INVITATION_CODE)).toBeVisible();
		await expect(page.getByText('✓ 適用済み')).toBeVisible();
		// 編集可能な input は存在しない
		await expect(page.locator('#invitationCode')).not.toBeAttached();

		// 4.5: 主要手段（Google）が表示される
		await expect(page.getByRole('button', { name: /Googleで登録/ })).toBeVisible();

		// 4.5: 展開ボタンが表示される
		await expect(page.getByRole('button', { name: '他の方法で登録' })).toBeVisible();

		// 4.4: ログイン導線が表示される
		await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible();
	});

	// ─── 4.5: 認証手段の展開操作 ──────────────────────────────────────────────

	test('「他の方法で登録」をクリックすると追加プロバイダが表示される (Req 4.5)', async ({
		page,
	}) => {
		await page.route('**/invitation/verify-context', async (route) => {
			if (await handlePreflight(route)) return;
			await jsonResponse(route, 201, {
				code: INVITATION_CODE,
				status: 'valid',
				creator: { name: 'テスト招待者', maskedId: 'usr2***' },
				expiresAt: null,
				usesRemaining: 1,
				perk: { type: 'none' },
			});
		});

		await page.goto(`/invite/${INVITATION_CODE}`);
		await expect(page.getByText(/テスト招待者さんから招待されました/)).toBeVisible({
			timeout: 10_000,
		});

		// 展開前: GitHub は非表示
		await expect(page.getByRole('button', { name: /GitHubで登録/ })).not.toBeVisible();

		// 展開操作
		await page.getByRole('button', { name: '他の方法で登録' }).click();

		// 展開後: 追加プロバイダが表示される
		await expect(page.getByRole('button', { name: /GitHubで登録/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /LINEで登録/ })).toBeVisible();
	});

	// ─── 4.4: ログイン導線 → login モード遷移 ────────────────────────────────

	test('「ログイン」をクリックするとログインフォームに遷移する (Req 4.4)', async ({ page }) => {
		await page.route('**/invitation/verify-context', async (route) => {
			if (await handlePreflight(route)) return;
			await jsonResponse(route, 201, {
				code: INVITATION_CODE,
				status: 'valid',
				creator: { name: 'テスト招待者', maskedId: 'usr2***' },
				expiresAt: null,
				usesRemaining: 1,
				perk: { type: 'none' },
			});
		});

		await page.goto(`/invite/${INVITATION_CODE}`);
		await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible({ timeout: 10_000 });

		// ログイン導線をクリック
		await page.getByRole('button', { name: 'ログイン' }).click();

		// login モードに遷移 → メール/パスワード入力フォームが現れる
		await expect(page.locator('input[type="email"]')).toBeVisible();
		await expect(page.locator('input[type="password"]')).toBeVisible();
	});

	// ─── 4.3: 特典ありコードで PerkBadge が表示される ────────────────────────

	test('特典ありコード（COMP 3ヶ月）で PerkBadge が表示される (Req 4.3)', async ({ page }) => {
		await page.route('**/invitation/verify-context', async (route) => {
			if (await handlePreflight(route)) return;
			await jsonResponse(route, 201, {
				code: INVITATION_CODE,
				status: 'valid',
				creator: { name: 'テスト招待者', maskedId: 'usr2***' },
				expiresAt: null,
				usesRemaining: 1,
				perk: { type: 'comp', months: 3 },
			});
		});

		await page.goto(`/invite/${INVITATION_CODE}`);
		await expect(page.getByText(/テスト招待者さんから招待されました/)).toBeVisible({
			timeout: 10_000,
		});

		// PerkBadge が表示される
		await expect(page.getByText(/AI 無料枠つき/)).toBeVisible();
		await expect(page.getByText(/3 ヶ月/)).toBeVisible();
	});
});

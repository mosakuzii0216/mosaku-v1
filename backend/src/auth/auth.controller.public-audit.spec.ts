import 'reflect-metadata';
import { AuthController } from './auth.controller';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

/**
 * グローバル JwtAuthGuard 化（APP_GUARD）に伴い、Bearer Token を持たない
 * OAuth init / callback と Bearerless 公開系ハンドラに `@Public()` が
 * 確実に付与されているかを検証する監査スペック。
 */
describe('AuthController @Public() 監査', () => {
	const isPublic = (methodName: string): boolean => {
		const handler = (AuthController.prototype as unknown as Record<string, unknown>)[methodName];
		return Reflect.getMetadata(IS_PUBLIC_KEY, handler as object) === true;
	};

	const publicHandlers: ReadonlyArray<{ method: string; description: string }> = [
		{ method: 'register', description: 'メール新規登録' },
		{ method: 'login', description: 'メールログイン' },
		{ method: 'logout', description: 'ログアウト' },
		{ method: 'resetPassword', description: 'パスワード再設定要求' },
		{ method: 'resetPasswordConfirm', description: 'パスワード再設定確定' },
		{ method: 'googleAuth', description: 'Google OAuth 開始' },
		{ method: 'googleAuthRedirect', description: 'Google OAuth コールバック' },
		{ method: 'appleAuth', description: 'Apple OAuth 開始' },
		{ method: 'appleAuthCallback', description: 'Apple OAuth コールバック' },
		{ method: 'xAuth', description: 'X OAuth 開始' },
		{ method: 'xAuthCallback', description: 'X OAuth コールバック' },
		{ method: 'startOAuthRegistration', description: 'OAuth 開始（招待コード state 引き継ぎ）' },
	];

	const removedHandlers: ReadonlyArray<string> = [
		'googleRegisterWithInvitation',
		'githubRegisterWithInvitation',
		'lineRegisterWithInvitation',
		'appleRegisterWithInvitation',
		'xRegisterWithInvitation',
	];

	publicHandlers.forEach(({ method, description }) => {
		it(`${description} (${method}) に @Public() が付与されている`, () => {
			expect(isPublic(method)).toBe(true);
		});
	});

	it('認証必須ハンドラ (getMe / changePassword / updateAdminRole) には @Public() が付与されていない', () => {
		expect(isPublic('getMe')).toBe(false);
		expect(isPublic('changePassword')).toBe(false);
		expect(isPublic('updateAdminRole')).toBe(false);
	});

	// Task 9.1: 旧 OAuth 招待コード登録 5 本は新フロー（state 引き継ぎ）に統合され削除済み。
	removedHandlers.forEach((method) => {
		it(`旧 ${method} ハンドラは AuthController から削除されている`, () => {
			expect(
				(AuthController.prototype as unknown as Record<string, unknown>)[method],
			).toBeUndefined();
		});
	});

	// Task 1.2: 廃止プロバイダ（LINE / GitHub）のエンドポイントハンドラ自体が削除されている。
	const removedOAuthHandlers: ReadonlyArray<string> = [
		'githubAuth',
		'githubAuthRedirect',
		'lineAuth',
		'lineAuthCallback',
	];

	removedOAuthHandlers.forEach((method) => {
		it(`廃止プロバイダハンドラ ${method} は AuthController から削除されている`, () => {
			expect(
				(AuthController.prototype as unknown as Record<string, unknown>)[method],
			).toBeUndefined();
		});
	});
});

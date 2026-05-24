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
		{ method: 'resetPassword', description: 'パスワード再設定' },
		{ method: 'googleAuth', description: 'Google OAuth 開始' },
		{ method: 'googleAuthRedirect', description: 'Google OAuth コールバック' },
		{ method: 'githubAuth', description: 'GitHub OAuth 開始' },
		{ method: 'githubAuthRedirect', description: 'GitHub OAuth コールバック' },
		{ method: 'lineAuth', description: 'LINE OAuth 開始' },
		{ method: 'lineAuthCallback', description: 'LINE OAuth コールバック' },
		{ method: 'appleAuth', description: 'Apple OAuth 開始' },
		{ method: 'appleAuthCallback', description: 'Apple OAuth コールバック' },
		{ method: 'xAuth', description: 'X OAuth 開始' },
		{ method: 'xAuthCallback', description: 'X OAuth コールバック' },
		{ method: 'googleRegisterWithInvitation', description: 'Google 招待コード登録' },
		{ method: 'githubRegisterWithInvitation', description: 'GitHub 招待コード登録' },
		{ method: 'lineRegisterWithInvitation', description: 'LINE 招待コード登録' },
		{ method: 'appleRegisterWithInvitation', description: 'Apple 招待コード登録' },
		{ method: 'xRegisterWithInvitation', description: 'X 招待コード登録' },
		{ method: 'startOAuthRegistration', description: 'OAuth 開始（招待コード state 引き継ぎ）' },
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
});

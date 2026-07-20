import type {
	OAuthProvider,
	AppleStrategyUser,
	XStrategyUser,
	OAuthStrategyUser,
} from './oauth.types';

/**
 * oauth.types.ts の型定義テスト
 * TypeScript のコンパイルチェックと、オブジェクト形状の検証を行う
 */
describe('OAuthProvider 型', () => {
	it('google・x・apple が OAuthProvider として有効な値であること', () => {
		const google: OAuthProvider = 'google';
		const x: OAuthProvider = 'x';
		const apple: OAuthProvider = 'apple';

		expect(google).toBe('google');
		expect(x).toBe('x');
		expect(apple).toBe('apple');
	});
});

describe('廃止プロバイダの型除去', () => {
	it('github・line は OAuthProvider として無効であること（型エラーで検出）', () => {
		// @ts-expect-error github は廃止プロバイダのため OAuthProvider に含まれない
		const github: OAuthProvider = 'github';
		// @ts-expect-error line は廃止プロバイダのため OAuthProvider に含まれない
		const line: OAuthProvider = 'line';

		expect(github).toBe('github');
		expect(line).toBe('line');
	});
});

describe('AppleStrategyUser 型', () => {
	it('必須フィールド（appleId・name）を持つオブジェクトが代入できること', () => {
		const user: AppleStrategyUser = {
			appleId: '000123.abc456def789.0000',
			name: 'Apple User',
		};
		expect(user.appleId).toBe('000123.abc456def789.0000');
		expect(user.name).toBe('Apple User');
	});

	it('email が undefined でも有効であること（2回目以降の認証はメールなし）', () => {
		const user: AppleStrategyUser = {
			appleId: '000123.abc456def789.0000',
			name: 'Apple User',
			email: undefined,
		};
		expect(user.email).toBeUndefined();
	});

	it('初回認証時のオブジェクト（email あり）が代入できること', () => {
		const user: AppleStrategyUser = {
			appleId: '000123.abc456def789.0000',
			name: 'Taro Apple',
			email: 'taro@privaterelay.appleid.com',
			accessToken: 'apple-jwt-token',
		};
		expect(user.email).toBe('taro@privaterelay.appleid.com');
	});
});

describe('XStrategyUser 型', () => {
	it('必須フィールド（xId・name）を持つオブジェクトが代入できること', () => {
		const user: XStrategyUser = {
			xId: '1234567890',
			name: 'X User',
		};
		expect(user.xId).toBe('1234567890');
		expect(user.name).toBe('X User');
	});

	it('オプショナルフィールドを含むオブジェクトが代入できること', () => {
		const user: XStrategyUser = {
			xId: '1234567890',
			name: 'X User',
			username: 'xuser123',
			email: undefined,
			picture: 'https://pbs.twimg.com/profile_images/photo.jpg',
			accessToken: 'x-access-token',
		};
		expect(user.username).toBe('xuser123');
		expect(user.email).toBeUndefined();
	});
});

describe('OAuthStrategyUser union 型', () => {
	it('AppleStrategyUser が OAuthStrategyUser として扱えること', () => {
		const user: OAuthStrategyUser = {
			appleId: '000123.abc456def789.0000',
			name: 'Apple User',
		};
		expect(user).toBeDefined();
	});

	it('XStrategyUser が OAuthStrategyUser として扱えること', () => {
		const user: OAuthStrategyUser = {
			xId: '1234567890',
			name: 'X User',
		};
		expect(user).toBeDefined();
	});
});

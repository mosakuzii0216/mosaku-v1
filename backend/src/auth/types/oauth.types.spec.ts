import type {
	OAuthProvider,
	LineStrategyUser,
	AppleStrategyUser,
	XStrategyUser,
	OAuthStrategyUser,
} from './oauth.types';

/**
 * oauth.types.ts の型定義テスト
 * TypeScript のコンパイルチェックと、オブジェクト形状の検証を行う
 */
describe('OAuthProvider 型', () => {
	it('line・apple・x が OAuthProvider として有効な値であること', () => {
		const line: OAuthProvider = 'line';
		const apple: OAuthProvider = 'apple';
		const x: OAuthProvider = 'x';
		// 既存プロバイダーも引き続き有効
		const google: OAuthProvider = 'google';
		const github: OAuthProvider = 'github';

		expect(line).toBe('line');
		expect(apple).toBe('apple');
		expect(x).toBe('x');
		expect(google).toBe('google');
		expect(github).toBe('github');
	});
});

describe('LineStrategyUser 型', () => {
	it('必須フィールド（lineId・name）を持つオブジェクトが代入できること', () => {
		const user: LineStrategyUser = {
			lineId: 'U1234567890',
			name: 'LINE User',
		};
		expect(user.lineId).toBe('U1234567890');
		expect(user.name).toBe('LINE User');
	});

	it('オプショナルフィールドを含むオブジェクトが代入できること', () => {
		const user: LineStrategyUser = {
			lineId: 'U1234567890',
			name: 'LINE User',
			email: 'line@example.com',
			picture: 'https://profile.line-scdn.net/picture.jpg',
			accessToken: 'line-access-token',
		};
		expect(user.email).toBe('line@example.com');
		expect(user.picture).toBeDefined();
		expect(user.accessToken).toBeDefined();
	});

	it('email が undefined でも有効であること（ユーザーが許可しない場合）', () => {
		const user: LineStrategyUser = {
			lineId: 'U9999999999',
			name: 'No Email User',
			email: undefined,
		};
		expect(user.email).toBeUndefined();
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
	it('LineStrategyUser が OAuthStrategyUser として扱えること', () => {
		const user: OAuthStrategyUser = {
			lineId: 'U1234567890',
			name: 'LINE User',
		};
		expect(user).toBeDefined();
	});

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

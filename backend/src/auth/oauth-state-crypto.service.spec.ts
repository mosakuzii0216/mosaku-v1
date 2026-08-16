import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '../config/config.service';
import { OAuthStateCrypto } from './oauth-state-crypto.service';

describe('OAuthStateCrypto', () => {
	const makeKey = (byte: number) => Buffer.alloc(32, byte).toString('hex');

	const buildService = async (hexKey: string) => {
		const mockConfig = {
			get oauthStateEncKey(): Buffer {
				return Buffer.from(hexKey, 'hex');
			},
		};
		const module: TestingModule = await Test.createTestingModule({
			providers: [OAuthStateCrypto, { provide: ConfigService, useValue: mockConfig }],
		}).compile();
		return module.get<OAuthStateCrypto>(OAuthStateCrypto);
	};

	let crypto: OAuthStateCrypto;

	beforeEach(async () => {
		crypto = await buildService(makeKey(0xab));
	});

	it('open(seal(x)) === x であること（往復）', () => {
		const plaintext = 'hello-verifier-abc123';
		const sealed = crypto.seal(plaintext);
		expect(crypto.open(sealed)).toBe(plaintext);
	});

	it('seal の結果が base64url 形式であること', () => {
		const sealed = crypto.seal('test');
		expect(sealed).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('同じ plaintext でも seal ごとに異なる値を返すこと（IV ランダム）', () => {
		const s1 = crypto.seal('same-text');
		const s2 = crypto.seal('same-text');
		expect(s1).not.toBe(s2);
	});

	it('auth tag を破壊すると open で throw すること（改ざん検知）', () => {
		const sealed = crypto.seal('verifier-value');
		const data = Buffer.from(sealed, 'base64url');
		// 末尾 16 byte が auth tag — 最後の 1 byte を反転
		data[data.length - 1] ^= 0xff;
		const tampered = data.toString('base64url');
		expect(() => crypto.open(tampered)).toThrow();
	});

	it('IV を破壊すると open で throw すること', () => {
		const sealed = crypto.seal('verifier-value');
		const data = Buffer.from(sealed, 'base64url');
		// 先頭 12 byte が IV — 最初の 1 byte を反転
		data[0] ^= 0xff;
		const tampered = data.toString('base64url');
		expect(() => crypto.open(tampered)).toThrow();
	});

	it('異なる鍵で open すると throw すること', async () => {
		const sealed = crypto.seal('secret-verifier');
		const otherCrypto = await buildService(makeKey(0x12));
		expect(() => otherCrypto.open(sealed)).toThrow();
	});

	it('unicode 文字列（日本語含む）も往復できること', () => {
		const text = 'abc_ランダムverifier_xyz';
		expect(crypto.open(crypto.seal(text))).toBe(text);
	});
});

import { createHash } from 'crypto';
import { generatePkcePair } from './pkce-codec';

describe('PkceCodec', () => {
	it('verifier が 43 文字の base64url 文字列であること', () => {
		const { verifier } = generatePkcePair();
		expect(verifier).toHaveLength(43);
		expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('challenge === base64url(sha256(verifier)) であること (S256)', () => {
		const { verifier, challenge } = generatePkcePair();
		const expected = createHash('sha256').update(verifier).digest('base64url');
		expect(challenge).toBe(expected);
	});

	it('verifier 長が RFC 7636 準拠（43〜128）かつ 43 文字固定であること', () => {
		const { verifier } = generatePkcePair();
		expect(verifier.length).toBeGreaterThanOrEqual(43);
		expect(verifier.length).toBeLessThanOrEqual(128);
		expect(verifier).toHaveLength(43);
	});

	it('呼び出しごとに異なる verifier が生成されること（randomBytes 由来）', () => {
		const { verifier: v1 } = generatePkcePair();
		const { verifier: v2 } = generatePkcePair();
		expect(v1).not.toBe(v2);
	});

	it('challenge が base64url 形式（パディングなし）であること', () => {
		const { challenge } = generatePkcePair();
		expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(challenge).not.toContain('=');
	});
});

import {
	CODE_GENERATOR,
	CodeGenerator,
	NanoidCodeGenerator,
	NO_LOOK_ALIKE_ALPHABET,
	NEW_CODE_LENGTH,
} from './code-generator';

describe('CodeGenerator (NanoidCodeGenerator)', () => {
	const generator: CodeGenerator = new NanoidCodeGenerator();

	describe('CODE_GENERATOR DI トークン', () => {
		it('Symbol で公開され、DI 識別子として利用できること', () => {
			expect(typeof CODE_GENERATOR).toBe('symbol');
		});
	});

	describe('alphabet 定義', () => {
		it('design.md で指定された alphabet 文字列と完全一致すること', () => {
			expect(NO_LOOK_ALIKE_ALPHABET).toBe('346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtuvwxy');
		});

		it('URL セーフ文字（英数字のみ、_ / - を含まない）であること', () => {
			expect(/^[0-9A-Za-z]+$/.test(NO_LOOK_ALIKE_ALPHABET)).toBe(true);
		});

		it('明確に紛らわしい数字/英字（0, O, 1, I, 2, Z, 5, S, l）を含まないこと', () => {
			const forbidden = ['0', 'O', '1', 'I', '2', 'Z', '5', 'S', 'l'];
			for (const ch of forbidden) {
				expect(NO_LOOK_ALIKE_ALPHABET.includes(ch)).toBe(false);
			}
		});

		it('alphabet 内に重複文字が存在しないこと', () => {
			const set = new Set(NO_LOOK_ALIKE_ALPHABET.split(''));
			expect(set.size).toBe(NO_LOOK_ALIKE_ALPHABET.length);
		});
	});

	describe('generate()', () => {
		it('長さ 10 の文字列を返すこと', () => {
			expect(NEW_CODE_LENGTH).toBe(10);
			expect(generator.generate()).toHaveLength(10);
		});

		it('100 回呼び出して全て長さ 10 / alphabet 範囲内であること', () => {
			const allowed = new Set(NO_LOOK_ALIKE_ALPHABET.split(''));
			for (let i = 0; i < 100; i++) {
				const code = generator.generate();
				expect(code).toHaveLength(10);
				for (const ch of code) {
					expect(allowed.has(ch)).toBe(true);
				}
			}
		});

		it('100 回呼び出して重複が発生しないこと（衝突確率ほぼ 0）', () => {
			const codes = new Set<string>();
			for (let i = 0; i < 100; i++) {
				codes.add(generator.generate());
			}
			expect(codes.size).toBe(100);
		});

		it('副作用ゼロのピュア関数として、呼び出しごとに独立した値を返すこと', () => {
			const a = generator.generate();
			const b = generator.generate();
			expect(a).not.toBe(b);
		});
	});

	describe('isLegacyFormat()', () => {
		it('32 文字大文字 hex（旧フォーマット）に対して true を返すこと', () => {
			const legacy = 'A1B2C3D4E5F6789012345678901234AB';
			expect(legacy).toHaveLength(32);
			expect(generator.isLegacyFormat(legacy)).toBe(true);
		});

		it('32 文字小文字 hex も受け付けること（後方互換）', () => {
			const legacy = 'a1b2c3d4e5f6789012345678901234ab';
			expect(generator.isLegacyFormat(legacy)).toBe(true);
		});

		it('新形式 10 文字 nanoid に対して false を返すこと', () => {
			const fresh = generator.generate();
			expect(generator.isLegacyFormat(fresh)).toBe(false);
		});

		it('長さ違い（31 文字 / 33 文字）に対して false を返すこと', () => {
			expect(generator.isLegacyFormat('A'.repeat(31))).toBe(false);
			expect(generator.isLegacyFormat('A'.repeat(33))).toBe(false);
		});

		it('32 文字でも hex 範囲外文字（G-Z）が含まれる場合は false', () => {
			const notHex = 'GHIJKLMNOPQRSTUVWXYZGHIJKLMNOPQR';
			expect(notHex).toHaveLength(32);
			expect(generator.isLegacyFormat(notHex)).toBe(false);
		});

		it('空文字列に対して false を返すこと', () => {
			expect(generator.isLegacyFormat('')).toBe(false);
		});
	});
});

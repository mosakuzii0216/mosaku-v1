import { describe, it, expect } from 'vitest';
import { lowlight } from './lowlight';

describe('lowlight 構文ハイライト基盤', () => {
	it('既定の言語サブセットが register されている', () => {
		const langs = lowlight.listLanguages();
		const expected = [
			'javascript',
			'typescript',
			'json',
			'xml',
			'css',
			'bash',
			'shell',
			'python',
			'sql',
			'markdown',
			'diff',
		];
		for (const lang of expected) {
			expect(langs).toContain(lang);
		}
	});

	it('html / js / ts などのエイリアスを解決できる', () => {
		expect(lowlight.registered('html')).toBe(true);
		expect(lowlight.registered('js')).toBe(true);
		expect(lowlight.registered('ts')).toBe(true);
	});

	it('登録済み言語のハイライトが例外を投げず hast を返す', () => {
		expect(() => lowlight.highlight('typescript', 'const x: number = 1;')).not.toThrow();
		const tree = lowlight.highlight('typescript', 'const x = 1;');
		expect(tree.children.length).toBeGreaterThan(0);
	});

	it('未登録言語でも例外を投げない（プレーンへフォールバック）', () => {
		// CodeBlockLowlight は未登録言語で highlightAuto にフォールバックするため例外は起きない
		expect(() => lowlight.highlightAuto('some plain text without language')).not.toThrow();
	});
});

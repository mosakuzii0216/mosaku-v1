import { describe, it, expect } from 'vitest';
import { contrastRatio, compositeOver } from './contrast';

/*
 * contrast.test.ts — コントラスト計算ユーティリティの自己検証（既知値）
 * ===========================================================================
 * `tokens.contrast.test.ts` にインライン定義されていたセルフテストを共有ユーティリティ
 * （contrast.ts）側へ抽出（rich-editor-blocks Task 2.1）。既知値で計算の正しさ自体を固定する。
 */
describe('コントラスト計算ユーティリティの自己検証（既知値）', () => {
	it('黒×白は 21:1', () => {
		const ratio = contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255, a: 1 });
		expect(ratio).toBeCloseTo(21, 1);
	});

	it('同色は 1:1', () => {
		const c = { r: 134, g: 239, b: 172, a: 1 };
		expect(contrastRatio(c, c)).toBeCloseTo(1, 5);
	});

	it('半透明（alpha=0）合成は床の色そのものになる', () => {
		const composited = compositeOver({ r: 0, g: 0, b: 0, a: 0 }, { r: 255, g: 255, b: 255, a: 1 });
		expect(composited).toEqual({ r: 255, g: 255, b: 255, a: 1 });
	});

	it('#ffffff は #767676（WCAG 既知の境界グレー）に対して約 4.54:1', () => {
		const ratio = contrastRatio({ r: 255, g: 255, b: 255, a: 1 }, { r: 118, g: 118, b: 118, a: 1 });
		expect(ratio).toBeCloseTo(4.54, 1);
	});
});

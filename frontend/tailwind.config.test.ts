import { describe, it, expect } from 'vitest';
// @ts-expect-error -- ESM の Tailwind 設定（JS）を型なしで読み込む
import tailwindConfig from './tailwind.config.js';
import typography from '@tailwindcss/typography';

/**
 * prose 有効化のための Tailwind 設定回帰ガード。
 *
 * `@tailwindcss/typography` が plugins から外れる / prose override が消えると、
 * エディタ・公開ビューのブロック要素が再びプレーン表示へ退行する（design.md の視覚回帰）。
 * 設定オブジェクトを直接 import して構造を assert することで、その退行をビルド前に検知する。
 */
describe('tailwind.config（prose typography 有効化）', () => {
	it('plugins に @tailwindcss/typography を登録している（Req 1.1/1.2）', () => {
		expect(tailwindConfig.plugins).toContain(typography);
	});

	it('既存の content グロブ・darkMode を破壊していない（Req 1.4）', () => {
		expect(tailwindConfig.content).toEqual(['./index.html', './src/**/*.{js,ts,jsx,tsx}']);
		expect(tailwindConfig.darkMode).toBe('class');
	});

	describe('prose 既定スタイルの override（Req 4.1/4.2/4.4/5.2）', () => {
		const css = tailwindConfig.theme?.extend?.typography?.DEFAULT?.css as
			| Record<string, unknown>
			| undefined;

		it('DEFAULT.css に override を定義している', () => {
			expect(css).toBeTruthy();
		});

		it('本文幅の中央寄せ制限を解除している（maxWidth: none）', () => {
			expect(css?.maxWidth).toBe('none');
		});

		it('インラインコードのバッククォート擬似要素を無効化している', () => {
			expect((css?.['code::before'] as Record<string, unknown>)?.content).toBe('none');
			expect((css?.['code::after'] as Record<string, unknown>)?.content).toBe('none');
		});

		it('pre / pre code の prose 既定配色・余白を無効化している（codeHighlight.css 優先）', () => {
			expect(css?.pre).toBeTruthy();
			expect(css?.['pre code']).toBeTruthy();
		});

		it('タスクリストの行頭バレット・インデントを抑止している', () => {
			const taskList = css?.['ul[data-type="taskList"]'] as Record<string, unknown> | undefined;
			expect(taskList?.listStyleType).toBe('none');
		});
	});
});

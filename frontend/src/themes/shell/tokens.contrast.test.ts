import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
	type RGBA,
	stripComments,
	findBlock,
	extractVar,
	parseColor,
	compositeOver,
	contrastRatio,
} from '../contrast';

/*
 * tokens.contrast.test.ts — 森トークンのコントラスト AA 機械検証（正しさの定義 / RED→GREEN）
 * ===============================================================================
 * 何を守るテストか:
 *   theme-immersive-world は「半透明 surface 越しに生きた背景（MoriEffectLayer）を透かす」
 *   設計。背後の最明値（白粒子 #ffffff・霧 rgba(255,255,255,…)）が surface を透けても、
 *   面上の文字が WCAG AA を割らないことを「色トークンの単一の源泉」= tokens.css の
 *   [data-theme="mori"] をパースして機械検証する。
 *
 * 検証戦略（両端で合成）:
 *   半透明 surface を 2 つの床に合成し、両端でコントラストを検証する。
 *     (1) 通常床 = --shell-base-bg（深緑ソリッド）
 *     (2) worst-case 床 = #ffffff（MoriEffectLayer の白粒子・霧が surface 裏を透ける最明値）
 *   合成式: result = α_surface · surface_rgb + (1 − α_surface) · 床
 *   → worst-case 床(#ffffff)の合成色でも AA を満たす = surface alpha は
 *      「白床合成でも本文 AA」を満たす下限で固定されている、ことを保証する。
 *
 * Requirements: 3.1（本文 4.5:1）, 3.3（focus-ring 非テキスト 3:1）, 3.4（低強調 4.5:1）, 3.5（機械検証）
 */

const CSS_PATH = resolve(__dirname, './tokens.css');
const css = readFileSync(CSS_PATH, 'utf-8');

const BODY_AA = 4.5; // WCAG 1.4.3 本文
const NON_TEXT_AA = 3.0; // WCAG 1.4.11 非テキスト（フォーカスリング等）

// ---- 森トークンの読み出し（mori 値未実装なら RED） ----------------------------

const stripped = stripComments(css);
const moriBlock = findBlock(stripped, /\[data-theme=["']?mori["']?\]\s*\{/);

/** mori トークンを取得。未実装（block / 変数欠落）なら expect で明示的に落とす（RED の意味づけ） */
function moriToken(name: string): RGBA {
	expect(
		moriBlock,
		'[data-theme="mori"] が tokens.css に未定義（Task 1.3 で色トークン値を実装する）',
	).not.toBeNull();
	const raw = extractVar(moriBlock as string, name);
	expect(raw, `mori に ${name} が未定義`).toBeTruthy();
	return parseColor(raw as string);
}

describe('tokens.contrast — mori surface×on-surface の WCAG AA（両端合成）', () => {
	it('[data-theme="mori"] ブロックが色トークンの単一の源泉として存在する', () => {
		expect(
			moriBlock,
			'[data-theme="mori"] が tokens.css に未定義（Task 1.3 で実装）',
		).not.toBeNull();
	});

	describe('半透明 surface を通常床（深緑）と worst-case 床（#ffffff）に合成しても AA を満たす', () => {
		const floors: ReadonlyArray<[label: string, get: () => RGBA]> = [
			['通常床（--shell-base-bg 深緑）', () => moriToken('--shell-base-bg')],
			['worst-case 床（#ffffff＝白粒子/霧の透け）', () => ({ r: 255, g: 255, b: 255, a: 1 })],
		];

		for (const [floorLabel, getFloor] of floors) {
			describe(floorLabel, () => {
				it('本文（--on-surface）は主要面 --surface 上で 4.5:1 以上', () => {
					const surface = compositeOver(moriToken('--surface'), getFloor());
					const ratio = contrastRatio(moriToken('--on-surface'), surface);
					expect(ratio, `on-surface/surface = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
						BODY_AA,
					);
				});

				it('本文（--on-surface）は副次面 --surface-variant 上で 4.5:1 以上', () => {
					const surface = compositeOver(moriToken('--surface-variant'), getFloor());
					const ratio = contrastRatio(moriToken('--on-surface'), surface);
					expect(
						ratio,
						`on-surface/surface-variant = ${ratio.toFixed(2)}:1`,
					).toBeGreaterThanOrEqual(BODY_AA);
				});

				it('低強調文字（--on-surface-variant）は主要面 --surface 上で 4.5:1 以上', () => {
					const surface = compositeOver(moriToken('--surface'), getFloor());
					const ratio = contrastRatio(moriToken('--on-surface-variant'), surface);
					expect(
						ratio,
						`on-surface-variant/surface = ${ratio.toFixed(2)}:1`,
					).toBeGreaterThanOrEqual(BODY_AA);
				});

				it('低強調文字（--on-surface-variant）は副次面 --surface-variant 上で 4.5:1 以上', () => {
					const surface = compositeOver(moriToken('--surface-variant'), getFloor());
					const ratio = contrastRatio(moriToken('--on-surface-variant'), surface);
					expect(
						ratio,
						`on-surface-variant/surface-variant = ${ratio.toFixed(2)}:1`,
					).toBeGreaterThanOrEqual(BODY_AA);
				});

				it('フォーカスリング（--focus-ring）は主要面 --surface 上で 3:1 以上（非テキスト）', () => {
					const surface = compositeOver(moriToken('--surface'), getFloor());
					const ratio = contrastRatio(moriToken('--focus-ring'), surface);
					expect(ratio, `focus-ring/surface = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
						NON_TEXT_AA,
					);
				});
			});
		}
	});

	it('accent 上の文字（--on-accent / --accent）は 4.5:1 以上', () => {
		// accent は不透明のため床合成不要
		const ratio = contrastRatio(moriToken('--on-accent'), moriToken('--accent'));
		expect(ratio, `on-accent/accent = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(BODY_AA);
	});
});

// ---- 計算ユーティリティ自体のセルフテストは ../contrast.test.ts へ抽出済み（Task 2.1・重複排除） ----

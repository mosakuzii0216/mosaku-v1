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

/*
 * 意味色 9 役割（破壊・成功・暗幕）のコントラスト AA 機械検証
 * ===========================================================
 * editor-surface-tokenization Task 1.1（RED）→ Task 1.2（GREEN）。
 * 破壊（--danger 系）・成功（--success 系）それぞれの「中核色／その上の前景／
 * 淡色コンテナ／その上の前景」と、モーダル背後の暗幕（--scrim）を検証する。
 * 中立既定（:root）と森（[data-theme='mori']）の両方を対象とする。
 *
 * 中核色（--danger / --success）は「ソリッド面の地・境界色・面の上のテキスト色」の
 * 3用途を持つが、テキストとして使えるのは --surface 系の面の上だけという使用条件を
 * 前提に、面の上のテキストとしての AA を検証する（アプリ床の直上に置く用法は対象外）。
 *
 * 淡色コンテナ（--danger-container / --success-container）は半透明のため、
 * 「アプリ床の直上／面の上」×「通常床／worst-case の白床」の 4 経路すべてで合成し、
 * いずれの経路でも AA を満たすことを検証する。
 *
 * Requirements: 6.1, 6.2, 7.6
 */
describe('tokens.contrast — 意味色 9 役割（破壊・成功・暗幕）の WCAG AA', () => {
	type ThemeLabel = 'neutral' | 'mori';

	const WHITE_FLOOR: RGBA = { r: 255, g: 255, b: 255, a: 1 };

	const rootBlock = findBlock(stripped, /:root\s*\{/);

	function themeBlock(theme: ThemeLabel): string | null {
		return theme === 'neutral' ? rootBlock : moriBlock;
	}

	/** 役割値を取得。未定義なら expect で明示的に落とす（RED の意味づけ） */
	function token(theme: ThemeLabel, name: string): RGBA {
		const block = themeBlock(theme);
		expect(block, `[${theme}] ブロックが tokens.css に存在しない`).not.toBeNull();
		const raw = extractVar(block as string, name);
		expect(raw, `[${theme}] に ${name} が未定義（Task 1.2 で色トークン値を実装する）`).toBeTruthy();
		return parseColor(raw as string);
	}

	function floors(theme: ThemeLabel): ReadonlyArray<[label: string, floor: RGBA]> {
		return [
			['通常床（--shell-base-bg）', token(theme, '--shell-base-bg')],
			['worst-case 床（#ffffff＝生きた背景の最明値の透け）', WHITE_FLOOR],
		];
	}

	/** 淡色コンテナの4経路（アプリ床の直上／面の上 × 通常床／worst-case白床）を合成する */
	function containerPaths(
		theme: ThemeLabel,
		containerName: string,
	): ReadonlyArray<[label: string, composited: RGBA]> {
		const container = token(theme, containerName);
		const surface = token(theme, '--surface');
		const result: Array<[string, RGBA]> = [];
		for (const [floorLabel, floor] of floors(theme)) {
			result.push([`アプリ床の直上 × ${floorLabel}`, compositeOver(container, floor)]);
			const effectiveSurface = compositeOver(surface, floor);
			result.push([`面の上 × ${floorLabel}`, compositeOver(container, effectiveSurface)]);
		}
		return result;
	}

	const CORE_PAIRS: ReadonlyArray<[core: string, on: string, label: string]> = [
		['--danger', '--on-danger', '破壊'],
		['--success', '--on-success', '成功'],
	];

	const CONTAINER_PAIRS: ReadonlyArray<[container: string, on: string, label: string]> = [
		['--danger-container', '--on-danger-container', '破壊の淡色コンテナ'],
		['--success-container', '--on-success-container', '成功の淡色コンテナ'],
	];

	const SURFACE_ROLES = ['--surface', '--surface-variant'] as const;

	for (const theme of ['neutral', 'mori'] as const) {
		describe(`[${theme}]`, () => {
			it('全ての面役割が対応する前景役割をペアで持つ（暗幕を除く参照整合性）', () => {
				const block = themeBlock(theme);
				expect(block, `[${theme}] ブロックが存在しない`).not.toBeNull();
				for (const [core, on] of [...CORE_PAIRS, ...CONTAINER_PAIRS]) {
					expect(
						extractVar(block as string, core),
						`[${theme}] に ${core} が未定義（Task 1.2 で実装）`,
					).toBeTruthy();
					expect(
						extractVar(block as string, on),
						`[${theme}] に ${on} が未定義（Task 1.2 で実装）`,
					).toBeTruthy();
				}
				// 暗幕（--scrim）は前景を載せない非テキスト面のため、対応する on-scrim は不要。
				// 存在自体は検証するが、前景ペアの参照整合性チェックからは除外する。
				expect(
					extractVar(block as string, '--scrim'),
					`[${theme}] に --scrim が未定義（Task 1.2 で実装）`,
				).toBeTruthy();
			});

			for (const [core, on, label] of CORE_PAIRS) {
				it(`${label}: ソリッド面の前景（${on}/${core}）は 4.5:1 以上`, () => {
					const ratio = contrastRatio(token(theme, on), token(theme, core));
					expect(ratio, `${on}/${core} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(BODY_AA);
				});

				describe(`${label}: 中核色（${core}）を面の上のテキストとして使った場合`, () => {
					for (const surfaceName of SURFACE_ROLES) {
						for (const [floorLabel, floor] of floors(theme)) {
							it(`${surfaceName} 上・${floorLabel} で 4.5:1 以上`, () => {
								const surface = compositeOver(token(theme, surfaceName), floor);
								const ratio = contrastRatio(token(theme, core), surface);
								expect(
									ratio,
									`${core}/${surfaceName}（${floorLabel}） = ${ratio.toFixed(2)}:1`,
								).toBeGreaterThanOrEqual(BODY_AA);
							});
						}
					}
				});
			}

			for (const [container, on, label] of CONTAINER_PAIRS) {
				it(`${label}（${on}/${container}）は4経路すべてで 4.5:1 以上`, () => {
					const onColor = token(theme, on);
					for (const [pathLabel, composited] of containerPaths(theme, container)) {
						const ratio = contrastRatio(onColor, composited);
						expect(
							ratio,
							`${on}/${container} @ ${pathLabel} = ${ratio.toFixed(2)}:1`,
						).toBeGreaterThanOrEqual(BODY_AA);
					}
				});
			}
		});
	}
});

// ---- 計算ユーティリティ自体のセルフテストは ../contrast.test.ts へ抽出済み（Task 2.1・重複排除） ----

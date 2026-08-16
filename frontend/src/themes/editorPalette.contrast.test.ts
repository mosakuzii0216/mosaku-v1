import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
	type RGBA,
	stripComments,
	findBlock,
	extractVar,
	parseColor,
	contrastRatio,
} from './contrast';

/*
 * editorPalette.contrast.test.ts — editor セマンティックパレットの AA 機械検証（RED→GREEN）
 * ===========================================================================================
 * rich-editor-blocks Task 2.2。tokens.css の `:root`（中立既定＝公開ビュー主経路兼フォール
 * バック）と各 `public/themes/*.css` の `.theme-root`（テーマ別実値）をパースし、テキスト色・
 * マーカー・コールアウトの全セマンティック色が WCAG AA(4.5:1) を満たすことを機械検証する。
 *
 * 色名・色数は CSS から動的に列挙する（ハードコードしない）ため、Task 2.3 で色を実装するまでは
 * 検出0件で RED になる（テスト先行）。
 *
 * 背景（両端合成）:
 *   本文テキストは `--theme-bg`（多ストップ linear-gradient・background-position アニメーション
 *   で循環）に直接乗る。宣言順で最初/最後の色＝グラデーションの「両端」を床として両方で
 *   コントラストを検証する（tokens.contrast.test.ts の通常床/worst-case 床という2床検証と
 *   同じ思想の「両端」版。全ストップ中の最明値まで含めると、床の最大輝度に対しては不透明な
 *   文字色でも理論上限 4.24:1 しか出せず AA(4.5) が数学的に不成立になるため、両端＝宣言上の
 *   端点を検証対象とする）。
 * マーカー/コールアウトは不透明な自己完結ペア（背景色×上の文字色）のため床合成は不要。
 *
 * Requirements: 1.7, 2.3, 2.6, 2.7, 2.8, 2.9, 2.10
 */

const BODY_AA = 4.5;

const TOKENS_CSS_PATH = resolve(__dirname, './shell/tokens.css');
const tokensCss = stripComments(readFileSync(TOKENS_CSS_PATH, 'utf-8'));

const THEME_NAMES = ['mori', 'umi', 'yoru', 'asa'] as const;
type ThemeName = (typeof THEME_NAMES)[number];

const themeCss: Record<ThemeName, string> = Object.fromEntries(
	THEME_NAMES.map((name) => [
		name,
		stripComments(
			readFileSync(resolve(__dirname, `../../public/themes/${name}/${name}.css`), 'utf-8'),
		),
	]),
) as Record<ThemeName, string>;

const rootBlock = findBlock(tokensCss, /:root\s*\{/);

function themeRootBlock(name: ThemeName): string | null {
	return findBlock(themeCss[name], /\.theme-root\s*\{/);
}

// ---- CSS ブロックからセマンティック色の名前を動的に列挙 ----------------------------

function matchAllNames(block: string, pattern: RegExp): string[] {
	const found = new Set<string>();
	const re = new RegExp(
		pattern.source,
		pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
	);
	let m: RegExpExecArray | null;
	while ((m = re.exec(block))) found.add(m[1]);
	return [...found];
}

const textNames = rootBlock ? matchAllNames(rootBlock, /--editor-text-([a-z0-9-]+)\s*:/i) : [];
const markerNames = rootBlock
	? matchAllNames(rootBlock, /--editor-marker-(?!on-)([a-z0-9-]+)\s*:/i)
	: [];
const markerOnNames = rootBlock
	? matchAllNames(rootBlock, /--editor-marker-on-([a-z0-9-]+)\s*:/i)
	: [];
const calloutVariants = rootBlock
	? matchAllNames(rootBlock, /--editor-callout-([a-z0-9]+)-bg\s*:/i)
	: [];

// ---- 値の解決（テーマ override があれば優先、無ければ :root 既定へフォールバック） -----

function resolveVar(name: string, theme: ThemeName | null): string {
	if (theme) {
		const block = themeRootBlock(theme);
		const themed = block ? extractVar(block, name) : null;
		if (themed) return themed;
	}
	expect(rootBlock, ':root ブロックが tokens.css に未定義').not.toBeNull();
	const rootValue = extractVar(rootBlock as string, name);
	expect(rootValue, `:root に ${name} が未定義（Task 2.3 で実装する）`).toBeTruthy();
	return rootValue as string;
}

function resolveColor(name: string, theme: ThemeName | null): RGBA {
	return parseColor(resolveVar(name, theme));
}

// ---- linear-gradient の「両端」（宣言順で最初/最後の色）抽出 --------------------------

function splitTopLevel(input: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = '';
	for (const ch of input) {
		if (ch === '(') depth += 1;
		if (ch === ')') depth -= 1;
		if (ch === ',' && depth === 0) {
			parts.push(current.trim());
			current = '';
		} else {
			current += ch;
		}
	}
	if (current.trim()) parts.push(current.trim());
	return parts;
}

function isDirectionToken(token: string): boolean {
	return /^-?\d+(\.\d+)?deg$/i.test(token) || /^to\s+/i.test(token);
}

function gradientEdgeColors(gradientValue: string): [RGBA, RGBA] {
	const match = gradientValue.match(/linear-gradient\(([\s\S]+)\)/);
	expect(match, `linear-gradient が見つからない: "${gradientValue}"`).not.toBeNull();
	const tokens = splitTopLevel((match as RegExpMatchArray)[1]);
	const colorTokens = tokens.filter((t) => !isDirectionToken(t));
	expect(
		colorTokens.length,
		`グラデーションの色数が2未満: "${gradientValue}"`,
	).toBeGreaterThanOrEqual(2);
	const parse = (t: string): RGBA => {
		const colorMatch = t.match(/#[0-9a-fA-F]{3,6}|rgba?\([^)]*\)/);
		return parseColor(colorMatch ? colorMatch[0] : t);
	};
	return [parse(colorTokens[0]), parse(colorTokens[colorTokens.length - 1])];
}

function themeBodyFloors(theme: ThemeName): [RGBA, RGBA] {
	const block = themeRootBlock(theme);
	expect(block, `.theme-root が ${theme}.css に未定義`).not.toBeNull();
	const bg = extractVar(block as string, '--theme-bg');
	expect(bg, `${theme} に --theme-bg が未定義`).toBeTruthy();
	return gradientEdgeColors(bg as string);
}

// 公開ビュー既定（:root 中立・data-theme 未適用）はプレーンな白地で解決する
const NEUTRAL_FLOOR: RGBA = { r: 255, g: 255, b: 255, a: 1 };

// ---- テスト本体 --------------------------------------------------------------------

describe('editorPalette.contrast — editor セマンティックパレットの WCAG AA', () => {
	it(':root ブロックが tokens.css に存在する', () => {
		expect(rootBlock, ':root が tokens.css に未定義').not.toBeNull();
	});

	describe('テキスト色（--editor-text-<name>）', () => {
		it('4色以上のセマンティック名が定義されている（Req2.3）', () => {
			expect(textNames.length).toBeGreaterThanOrEqual(4);
		});

		it(':root 中立既定（公開ビュー既定の白地）で全名が AA を満たす（Req2.9/6.5）', () => {
			for (const name of textNames) {
				const color = resolveColor(`--editor-text-${name}`, null);
				const ratio = contrastRatio(color, NEUTRAL_FLOOR);
				expect(
					ratio,
					`--editor-text-${name} vs 白地 = ${ratio.toFixed(2)}:1`,
				).toBeGreaterThanOrEqual(BODY_AA);
			}
		});

		for (const theme of THEME_NAMES) {
			it(`${theme}: 本文グラデ背景の両端で全名が AA を満たす（Req2.7）`, () => {
				const [floorA, floorB] = themeBodyFloors(theme);
				for (const name of textNames) {
					const color = resolveColor(`--editor-text-${name}`, theme);
					const ratioA = contrastRatio(color, floorA);
					const ratioB = contrastRatio(color, floorB);
					expect(
						ratioA,
						`${theme} --editor-text-${name} vs 端A = ${ratioA.toFixed(2)}:1`,
					).toBeGreaterThanOrEqual(BODY_AA);
					expect(
						ratioB,
						`${theme} --editor-text-${name} vs 端B = ${ratioB.toFixed(2)}:1`,
					).toBeGreaterThanOrEqual(BODY_AA);
				}
			});

			it(`${theme}: AA を満たすテキスト色が4色以上ある（Req2.3 下限割れ検出）`, () => {
				const [floorA, floorB] = themeBodyFloors(theme);
				const passing = textNames.filter((name) => {
					const color = resolveColor(`--editor-text-${name}`, theme);
					return contrastRatio(color, floorA) >= BODY_AA && contrastRatio(color, floorB) >= BODY_AA;
				});
				expect(passing.length).toBeGreaterThanOrEqual(4);
			});
		}
	});

	describe('マーカー（--editor-marker-<name> / --editor-marker-on-<name>）', () => {
		it('4色以上のセマンティック名が定義され、bg/on が対で揃っている（Req2.3）', () => {
			expect(markerNames.length).toBeGreaterThanOrEqual(4);
			expect([...markerNames].sort()).toEqual([...markerOnNames].sort());
		});

		it(':root 中立既定で全名が AA を満たす（不透明背景×文字, Req2.9）', () => {
			for (const name of markerNames) {
				const bg = resolveColor(`--editor-marker-${name}`, null);
				const on = resolveColor(`--editor-marker-on-${name}`, null);
				const ratio = contrastRatio(on, bg);
				expect(
					ratio,
					`--editor-marker-${name} on/bg = ${ratio.toFixed(2)}:1`,
				).toBeGreaterThanOrEqual(BODY_AA);
			}
		});

		for (const theme of THEME_NAMES) {
			it(`${theme}: 全名が AA を満たす（Req2.8）`, () => {
				for (const name of markerNames) {
					const bg = resolveColor(`--editor-marker-${name}`, theme);
					const on = resolveColor(`--editor-marker-on-${name}`, theme);
					const ratio = contrastRatio(on, bg);
					expect(
						ratio,
						`${theme} --editor-marker-${name} on/bg = ${ratio.toFixed(2)}:1`,
					).toBeGreaterThanOrEqual(BODY_AA);
				}
			});

			it(`${theme}: AA を満たすマーカーが4色以上ある（Req2.3 下限割れ検出）`, () => {
				const passing = markerNames.filter((name) => {
					const bg = resolveColor(`--editor-marker-${name}`, theme);
					const on = resolveColor(`--editor-marker-on-${name}`, theme);
					return contrastRatio(on, bg) >= BODY_AA;
				});
				expect(passing.length).toBeGreaterThanOrEqual(4);
			});
		}
	});

	describe('コールアウト（--editor-callout-<variant>-bg / -on）', () => {
		it('少なくとも2種別（point / 注意 相当）が定義されている（Req1.2）', () => {
			expect(calloutVariants.length).toBeGreaterThanOrEqual(2);
		});

		it(':root 中立既定で全種別が AA を満たす（不透明背景×文字, Req1.7）', () => {
			for (const variant of calloutVariants) {
				const bg = resolveColor(`--editor-callout-${variant}-bg`, null);
				const on = resolveColor(`--editor-callout-${variant}-on`, null);
				const ratio = contrastRatio(on, bg);
				expect(
					ratio,
					`--editor-callout-${variant} on/bg = ${ratio.toFixed(2)}:1`,
				).toBeGreaterThanOrEqual(BODY_AA);
			}
		});

		for (const theme of THEME_NAMES) {
			it(`${theme}: 全種別が AA を満たす（Req1.7）`, () => {
				for (const variant of calloutVariants) {
					const bg = resolveColor(`--editor-callout-${variant}-bg`, theme);
					const on = resolveColor(`--editor-callout-${variant}-on`, theme);
					const ratio = contrastRatio(on, bg);
					expect(
						ratio,
						`${theme} --editor-callout-${variant} on/bg = ${ratio.toFixed(2)}:1`,
					).toBeGreaterThanOrEqual(BODY_AA);
				}
			});
		}
	});
});

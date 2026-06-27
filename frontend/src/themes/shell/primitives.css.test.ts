import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/*
 * primitives.css.test.ts — 質感プリミティブ層のパターン検証（正しさの定義 / RED→GREEN）
 * ===============================================================================
 * 何を守るテストか:
 *   theme-immersive-world は「玄関の彩色を生の色で直当てせず、面側にトークンを当てる」契約で
 *   過去ロールバック（ヘッダー文字消失）を構造的に防ぐ。本層（Layer①・bundle）はその契約を
 *   実体化する theme-neutral な構造クラス群＝「トークンを読むだけ」のプリミティブを提供する。
 *
 *   よって本テストは値の正しさ（コントラスト＝tokens.contrast.test.ts の担当）ではなく、
 *   「プリミティブが (a) 生の色リテラルを持たず必ず var(--token) 経由で解決する、
 *    (b) 半透明 backdrop で生きた背景を透かす、(c) 奥行き/テクスチャ/状態/フォーカス/
 *    余白/タイポの各トークンを実際に読む、(d) reduced-motion で動きのみ停止し静的質感は残す」
 *   という構造契約を機械検証する。
 *
 * Requirements: 1.2/1.4（生リテラル不可・面側適用）, 4.1/4.2（テクスチャ/奥行き）,
 *   4.3/4.4（余白/游明朝）, 4.5/4.6（マイクロインタラクション/reduced-motion）,
 *   3.3（状態・focus-ring）, 5.2（半透明 backdrop で連続性）
 */

const CSS_PATH = resolve(__dirname, './primitives.css');

/** 未実装（ファイル欠落）でも import 時に throw せず、各 assertion を個別に RED で落とす */
function readCss(): string {
	try {
		return readFileSync(CSS_PATH, 'utf-8');
	} catch {
		return '';
	}
}

function stripComments(input: string): string {
	return input.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** ヘッダーにマッチするブロックの中身（ブレース内）を、入れ子を数えて取り出す */
function findBlockBody(input: string, headerPattern: RegExp): string | null {
	const match = input.match(headerPattern);
	if (!match || match.index === undefined) return null;
	const braceStart = input.indexOf('{', match.index);
	if (braceStart === -1) return null;
	let depth = 0;
	for (let i = braceStart; i < input.length; i++) {
		if (input[i] === '{') depth += 1;
		else if (input[i] === '}') {
			depth -= 1;
			if (depth === 0) return input.slice(braceStart + 1, i);
		}
	}
	return null;
}

/** トップレベル（depth 0）のセレクタヘッダー群を取り出す */
function topLevelHeaders(input: string): string[] {
	const headers: string[] = [];
	let depth = 0;
	let sliceStart = 0;
	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (ch === '{') {
			if (depth === 0) headers.push(input.slice(sliceStart, i).trim());
			depth += 1;
		} else if (ch === '}') {
			depth -= 1;
			if (depth === 0) sliceStart = i + 1;
		}
	}
	return headers.filter(Boolean);
}

const css = readCss();
const stripped = stripComments(css);

describe('primitives.css — Quality Primitives (Layer① / bundle, render-blocking)', () => {
	describe('2.1 質感 5 軸の構造クラス（最小セット）が存在する', () => {
		it.each([
			['.shell-surface'],
			['.shell-panel'],
			['.shell-card'],
			['.shell-nav-item'],
			['.shell-field'],
			['.shell-button'],
			['.shell-button-primary'],
		])('%s ルールを定義する', (selector) => {
			const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			expect(stripped, `${selector} が未定義`).toMatch(new RegExp(`${escaped}\\s*[,{:]`));
		});
	});

	describe('面の地は半透明 backdrop で生きた背景を透かす（5.2）', () => {
		const surface = (): string => findBlockBody(stripped, /\.shell-surface\s*\{/) ?? '';

		it('.shell-surface は地色を var(--surface) で解決する', () => {
			expect(surface()).toMatch(/background(-color)?\s*:\s*var\(--surface\)/);
		});

		it('.shell-surface は前景文字を var(--on-surface) で解決する', () => {
			expect(surface()).toMatch(/color\s*:\s*var\(--on-surface\)/);
		});

		it('.shell-surface は backdrop-filter をトークンで与え背後を透かす', () => {
			// 中立既定では --surface-backdrop: none（今日の見た目を保つ / 7.1）。
			expect(surface()).toMatch(/backdrop-filter\s*:\s*var\(--surface-backdrop\)/);
		});
	});

	describe('パネル/カードは奥行き（エレベーション）＋テクスチャを持つ（4.1, 4.2）', () => {
		const panel = (): string => findBlockBody(stripped, /\.shell-panel\s*\{/) ?? '';
		const card = (): string => findBlockBody(stripped, /\.shell-card\s*\{/) ?? '';

		it('.shell-panel はエレベーショントークン var(--elevation-*) を読む', () => {
			expect(panel()).toMatch(/box-shadow\s*:\s*var\(--elevation-\d\)/);
		});

		it('.shell-card はエレベーショントークン var(--elevation-*) を読む', () => {
			expect(card()).toMatch(/box-shadow\s*:\s*var\(--elevation-\d\)/);
		});

		it('.shell-card はテクスチャトークン var(--surface-texture) のフックを持つ', () => {
			// 中立既定 none。Layer③（mori.css）が後追いで重量テクスチャを精緻化する（7.5）。
			expect(card()).toMatch(/var\(--surface-texture\)/);
		});
	});

	describe('ナビ要素・入力は状態トークン＋フォーカスリングで背景と区別可能（3.2, 3.3）', () => {
		it('.shell-nav-item は前景に var(--on-surface) を読む', () => {
			const nav = findBlockBody(stripped, /\.shell-nav-item\s*\{/) ?? '';
			expect(nav).toMatch(/color\s*:\s*var\(--on-surface\)/);
		});

		it('ホバー状態は var(--state-hover) を読む', () => {
			expect(stripped).toMatch(/var\(--state-hover\)/);
		});

		it('選択状態は var(--state-selected) と var(--on-state-selected) を読む', () => {
			expect(stripped).toMatch(/var\(--state-selected\)/);
			expect(stripped).toMatch(/var\(--on-state-selected\)/);
		});

		it('.shell-field は境界に var(--outline) を読む', () => {
			const field = findBlockBody(stripped, /\.shell-field\s*\{/) ?? '';
			expect(field).toMatch(/var\(--outline\)/);
		});

		it('フォーカス輪郭は var(--focus-ring) を読む', () => {
			expect(stripped).toMatch(/outline\s*:[^;]*var\(--focus-ring\)/);
		});

		it('低強調テキストは var(--on-surface-variant) を読む（3.4 判読下限）', () => {
			expect(stripped).toMatch(/var\(--on-surface-variant\)/);
		});
	});

	describe('ボタンは accent × on-accent をペアで読む（3.1）', () => {
		it('.shell-button-primary は var(--accent) と var(--on-accent) を読む', () => {
			const btn = findBlockBody(stripped, /\.shell-button-primary\s*\{/) ?? '';
			expect(btn).toMatch(/var\(--accent\)/);
			expect(btn).toMatch(/var\(--on-accent\)/);
		});
	});

	describe('意図的な余白スケールと游明朝軸のタイポ階層を与える（4.3, 4.4）', () => {
		it('余白スケール var(--shell-space-*) を読む', () => {
			expect(stripped).toMatch(/var\(--shell-space-\d\)/);
		});

		it('署名フォント var(--shell-font) を読む', () => {
			expect(stripped).toMatch(/font-family\s*:\s*var\(--shell-font\)/);
		});

		it('字階層 var(--shell-text-*) を読む', () => {
			expect(stripped).toMatch(/var\(--shell-text-[a-z]+\)/);
		});

		it('行間・字間 var(--shell-line-height) / var(--shell-letter-spacing) を読む', () => {
			expect(stripped).toMatch(/var\(--shell-line-height\)/);
			expect(stripped).toMatch(/var\(--shell-letter-spacing\)/);
		});
	});

	describe('色は必ずトークン経由（生カラーリテラル禁止 / ロールバック回避 1.2, 1.4）', () => {
		it('hex カラーリテラル（#rgb / #rrggbb）を直書きしない', () => {
			const hex = stripped.match(/#[0-9a-fA-F]{3,8}\b/g);
			expect(hex, `生 hex 色を検出: ${hex?.join(', ')}`).toBeNull();
		});

		it('rgb() / rgba() リテラルを直書きしない（色は tokens.css が単一の源泉）', () => {
			expect(stripped, 'rgb()/rgba() を直書きしている').not.toMatch(/\brgba?\(/);
		});

		it('トップレベルセレクタは全て .shell-* クラス（要素型セレクタで配色を漏らさない）', () => {
			for (const header of topLevelHeaders(stripped)) {
				if (header.startsWith('@')) continue;
				for (const part of header
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)) {
					expect(part.startsWith('.shell-'), `非 .shell- セレクタ: "${part}"`).toBe(true);
				}
			}
		});
	});

	describe('2.2 マイクロインタラクション（4.5）', () => {
		it('操作要素にトランジションを与える', () => {
			const card = findBlockBody(stripped, /\.shell-card\s*\{/) ?? '';
			expect(card).toMatch(/transition\s*:/);
		});

		it('ホバー時のフィードバック（状態遷移）を持つ', () => {
			expect(stripped).toMatch(/\.shell-card:hover\s*\{/);
		});

		it('押下/ホバーの操作フィードバックをボタンにも与える', () => {
			expect(stripped).toMatch(/\.shell-button(-primary)?:(hover|active)\s*[,{]/);
		});
	});

	describe('reduced-motion で動きのみ停止し、静的質感（テクスチャ/奥行き/余白/タイポ）は維持（4.6）', () => {
		const reducedMotion = (): string =>
			findBlockBody(stripped, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/) ?? '';

		it('prefers-reduced-motion: reduce メディアクエリを含む', () => {
			expect(stripped).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/);
		});

		it('reduced-motion ブロックでトランジション/アニメーションを停止する', () => {
			expect(reducedMotion()).toMatch(/(transition|animation)\s*:\s*none/);
		});

		it('reduced-motion ブロックは静的質感（box-shadow/テクスチャ/フォント）をリセットしない', () => {
			const block = reducedMotion();
			expect(block, 'box-shadow をリセットしている').not.toMatch(/box-shadow\s*:/);
			expect(block, 'background をリセットしている').not.toMatch(/background\s*:/);
			expect(block, 'font をリセットしている').not.toMatch(/font(-family)?\s*:/);
		});
	});
});

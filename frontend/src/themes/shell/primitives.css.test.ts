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

		it('トップレベルセレクタは全て .shell-* / .app-shell クラス（要素型セレクタで配色を漏らさない）', () => {
			for (const header of topLevelHeaders(stripped)) {
				if (header.startsWith('@')) continue;
				for (const part of header
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)) {
					// .app-shell は玄関ルートの床（クラス選択子＝要素型ではない）。配色漏れの懸念は無い（4.1）。
					expect(
						part.startsWith('.shell-') || part === '.app-shell',
						`非 .shell-/.app-shell セレクタ: "${part}"`,
					).toBe(true);
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

	/*
	 * editor-surface-tokenization Task 2.1 — 押下・ホバー・無効の状態表現
	 * ===============================================================================
	 * Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 5.1, 5.5, 5.6, 6.4, 7.5
	 */
	describe('Task 2.1 押下（ON）・ホバー・無効の状態表現をボタンプリミティブへ追加する', () => {
		const pressed = (): string =>
			findBlockBody(stripped, /\.shell-button\[aria-pressed='true'\][^{]*\{/) ?? '';
		const disabled = (): string => findBlockBody(stripped, /\.shell-button:disabled[^{]*\{/) ?? '';

		it('.shell-button-primary も押下状態セレクタを共有する', () => {
			expect(stripped).toMatch(/\.shell-button-primary\[aria-pressed='true'\]/);
		});

		it('押下（ON）状態は地・文字・境界の3軸をトークンで変える', () => {
			const block = pressed();
			expect(block, '押下状態の地が var(--state-selected) を読んでいない').toMatch(
				/background(-color)?\s*:\s*var\(--state-selected\)/,
			);
			expect(block, '押下状態の文字が var(--on-state-selected) を読んでいない').toMatch(
				/color\s*:\s*var\(--on-state-selected\)/,
			);
			expect(block, '押下状態の境界が var(--accent) を読んでいない').toMatch(
				/border(-color)?\s*:[^;]*var\(--accent\)/,
			);
		});

		it('押下（ON）状態は字幅の手がかりを併用する（形状の識別可能性・地の差だけでは相互比が識別不能に近いため）', () => {
			expect(pressed()).toMatch(/font-weight\s*:\s*600/);
		});

		it('ホバーは非押下時のみ効く（押下中のホバーで ON 表現が壊れない）', () => {
			expect(stripped).toMatch(/\.shell-button:not\(\[aria-pressed='true'\]\):hover/);
			expect(stripped).toMatch(/\.shell-button-primary:not\(\[aria-pressed='true'\]\):hover/);
		});

		it('.shell-button-primary も無効状態セレクタを共有する', () => {
			expect(stripped).toMatch(/\.shell-button-primary:disabled/);
		});

		it('無効状態は不透明度を使わず前景色の切替で表現する', () => {
			const block = disabled();
			expect(
				block,
				'不透明度で無効を表現している（半透明面で実効コントラストが崩壊する）',
			).not.toMatch(/opacity\s*:/);
			expect(block, '無効状態の前景が var(--on-surface-variant) を読んでいない').toMatch(
				/color\s*:\s*var\(--on-surface-variant\)/,
			);
		});

		it('無効状態は操作不可のカーソルを与える', () => {
			expect(disabled()).toMatch(/cursor\s*:\s*not-allowed/);
		});
	});

	/*
	 * editor-surface-tokenization Task 2.2 — 浮遊面・候補行・暗幕のプリミティブ
	 * ===============================================================================
	 * Requirements: 1.3, 1.6, 3.1, 3.2, 3.3, 3.4, 5.1, 6.3
	 */
	describe('Task 2.2 浮遊面・候補行・暗幕のプリミティブを追加する', () => {
		const popover = (): string => findBlockBody(stripped, /\.shell-popover\s*\{/) ?? '';
		const popoverHover = (): string =>
			findBlockBody(stripped, /\.shell-popover-item:hover\s*\{/) ?? '';
		const popoverSelected = (): string =>
			findBlockBody(stripped, /\.shell-popover-item\[aria-selected='true'\]\s*\{/) ?? '';
		const popoverFocus = (): string =>
			findBlockBody(stripped, /\.shell-popover-item:focus-visible\s*\{/) ?? '';
		const scrim = (): string => findBlockBody(stripped, /\.shell-scrim\s*\{/) ?? '';

		it('.shell-popover / .shell-popover-item / .shell-scrim ルールを定義する', () => {
			expect(stripped, '.shell-popover が未定義').toMatch(/\.shell-popover\s*[,{]/);
			expect(stripped, '.shell-popover-item が未定義').toMatch(/\.shell-popover-item\s*[,{:]/);
			expect(stripped, '.shell-scrim が未定義').toMatch(/\.shell-scrim\s*[,{]/);
		});

		it('.shell-popover は地・文字・境界・奥行きをトークンで解決する', () => {
			const block = popover();
			expect(block).toMatch(/background(-color)?\s*:\s*var\(--surface\)/);
			expect(block).toMatch(/color\s*:\s*var\(--on-surface\)/);
			expect(block).toMatch(/border[^:]*:[^;]*var\(--outline\)/);
			expect(block).toMatch(/box-shadow\s*:\s*var\(--elevation-3\)/);
		});

		it('.shell-popover は半透明 backdrop で生きた背景を透かす', () => {
			expect(popover()).toMatch(/backdrop-filter\s*:\s*var\(--surface-backdrop\)/);
		});

		it('.shell-popover は高さ制約・スクロール・寸法を宣言しない（面の質感とレイアウトの分離。構造の異なる4面へ同じクラスが当たるため）', () => {
			const block = popover();
			expect(block, 'max-height を宣言している').not.toMatch(/max-height\s*:/);
			expect(block, 'height を宣言している').not.toMatch(/(?<!max-|line-)height\s*:/);
			expect(block, 'overflow を宣言している').not.toMatch(/overflow(-[xy])?\s*:/);
			expect(block, 'width を宣言している').not.toMatch(/(?<!max-|min-)width\s*:/);
		});

		it('候補行のホバーは var(--state-hover) を読む', () => {
			expect(popoverHover()).toMatch(/var\(--state-hover\)/);
		});

		it('候補行の選択状態は var(--state-selected) と var(--on-state-selected) のペアを読む', () => {
			expect(popoverSelected()).toMatch(/var\(--state-selected\)/);
			expect(popoverSelected()).toMatch(/var\(--on-state-selected\)/);
		});

		it('候補行のフォーカスは var(--focus-ring) を読む', () => {
			expect(popoverFocus()).toMatch(/var\(--focus-ring\)/);
		});

		it('.shell-scrim は var(--scrim) を読む', () => {
			expect(scrim()).toMatch(/var\(--scrim\)/);
		});

		it('浮遊面内の補助テキストは既存の .shell-text-muted で解決できる（面ごとの専用クラスを新設しない）', () => {
			expect(stripped).toMatch(/\.shell-text-muted\s*\{/);
		});
	});

	/*
	 * editor-surface-tokenization Task 2.3 — 構造契約と reduced-motion 列挙の機械検証
	 * ===============================================================================
	 * Requirements: 2.1, 2.6, 3.1, 5.5, 5.6, 6.5, 8.2
	 */
	describe('Task 2.3 新クラス・新状態が reduced-motion ブロックに列挙されている', () => {
		const reducedMotion = (): string =>
			findBlockBody(stripped, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/) ?? '';

		it('.shell-popover-item のトランジションは reduced-motion で停止する', () => {
			expect(reducedMotion()).toMatch(/\.shell-popover-item\b/);
		});
	});

	/*
	 * editor-surface-tokenization Task 4 — Prose Bridge（本文編集面の色所有権整理）
	 * ===============================================================================
	 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 5.2, 5.3
	 */
	describe('Task 4 Prose Bridge：本文編集面は「親に従う」宣言のみを持つ', () => {
		const host = (): string => findBlockBody(stripped, /\.shell-prose-host\s*\{/) ?? '';
		const hostProseMirror = (): string =>
			findBlockBody(stripped, /\.shell-prose-host\s+\.ProseMirror\s*\{/) ?? '';

		it('.shell-prose-host は中立時の着地先を var(--on-surface) に固定する', () => {
			expect(host()).toMatch(/color\s*:\s*var\(--on-surface\)/);
		});

		it('.shell-prose-host .ProseMirror の color は inherit のみ（直書き禁止・Layer③ の本文色所有を守る）', () => {
			const block = hostProseMirror();
			expect(block, '.shell-prose-host .ProseMirror が未定義').not.toBe('');
			const colorDecls = block.match(/(?<!--tw-prose-\S*)\bcolor\s*:\s*[^;]+;/g) ?? [];
			expect(colorDecls, `color 宣言: ${colorDecls.join(', ')}`).toHaveLength(1);
			expect(colorDecls[0]).toMatch(/color\s*:\s*inherit\s*;/);
		});

		it('.shell-prose-host .ProseMirror は prose 組み込みパレットを currentColor へ脱色する', () => {
			const block = hostProseMirror();
			for (const key of [
				'body',
				'headings',
				'lead',
				'links',
				'bold',
				'counters',
				'bullets',
				'quotes',
				'captions',
			]) {
				expect(block, `--tw-prose-${key} が currentColor でない`).toMatch(
					new RegExp(`--tw-prose-${key}\\s*:\\s*currentColor`),
				);
			}
		});

		it('.shell-prose-host .ProseMirror は罫線系の prose 変数を currentColor の color-mix で脱色する', () => {
			const block = hostProseMirror();
			for (const key of ['hr', 'quote-borders', 'th-borders', 'td-borders']) {
				expect(block, `--tw-prose-${key} が color-mix(currentColor) でない`).toMatch(
					new RegExp(
						`--tw-prose-${key}\\s*:\\s*color-mix\\(in srgb, currentColor \\d+%, transparent\\)`,
					),
				);
			}
		});
	});
});

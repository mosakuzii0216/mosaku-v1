import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const CSS_PATH = resolve(__dirname, '../../public/themes/mori/mori.css');
const css = readFileSync(CSS_PATH, 'utf-8');

const OTHER_THEMES = ['aka', 'ao', 'code', 'kami', 'kuro', 'siro'] as const;

function stripComments(input: string): string {
	return input.replace(/\/\*[\s\S]*?\*\//g, '');
}

function findBlock(input: string, headerPattern: RegExp): string | null {
	const match = input.match(headerPattern);
	if (!match || match.index === undefined) return null;
	const braceStart = input.indexOf('{', match.index);
	if (braceStart === -1) return null;
	let depth = 0;
	for (let i = braceStart; i < input.length; i++) {
		if (input[i] === '{') depth += 1;
		else if (input[i] === '}') {
			depth -= 1;
			if (depth === 0) return input.slice(match.index, i + 1);
		}
	}
	return null;
}

describe('mori.css — Mosaku brand theme (Phase A, task 1)', () => {
	const stripped = stripComments(css);

	describe('1.1 深緑カラーパレットと CSS 変数の定義', () => {
		it('.theme-root ルールを定義する', () => {
			expect(stripped).toMatch(/\.theme-root\s*\{/);
		});

		it('公開 CSS 変数をすべて宣言する', () => {
			const required = [
				'--theme-bg',
				'--theme-text-color',
				'--theme-heading-color',
				'--theme-accent-color',
				'--theme-border-color',
				'--theme-font-family',
				'--theme-font-size',
				'--theme-line-height',
				'--theme-padding',
				'--theme-margin',
				'--theme-border-radius',
			];
			for (const name of required) {
				expect(stripped, `${name} が未定義`).toMatch(new RegExp(`${name}\\s*:`));
			}
		});

		it('ログイン画面 (login-visual-redesign) と同じ深緑トーンを採用する', () => {
			// LoginPageLayout と ForestAnimationLayer で使用されている配色
			expect(stripped).toContain('#00552e');
			expect(stripped).toContain('#1a4d2e');
			expect(stripped).toContain('#47885e');
		});

		it('外部リソース（@import / 外部 url()）を使用しない（自己完結 data: noise は許容）', () => {
			expect(stripped).not.toMatch(/@import\b/);
			// url() は data: スキーム（自己完結インライン）のみ許容。http(s)・相対パス等の
			// 外部参照は禁止（7.2 外部リソース不使用 / Layer③ の data-URI noise は外部ではない）。
			for (const m of stripped.matchAll(/url\(\s*(['"]?)([^'")]*)/g)) {
				expect(m[2].startsWith('data:'), `外部 url 参照: ${m[2]}`).toBe(true);
			}
		});
	});

	describe('1.2 wave-pulse 背景アニメーション', () => {
		it('@keyframes wave-pulse を定義する', () => {
			expect(stripped).toMatch(/@keyframes\s+wave-pulse\s*\{/);
		});

		it('.theme-root で wave-pulse を 12s 周期で適用する', () => {
			const rootBlock = findBlock(stripped, /\.theme-root\s*\{/);
			expect(rootBlock, '.theme-root ブロックが取得できない').not.toBeNull();
			expect(rootBlock!).toMatch(/wave-pulse/);
			expect(rootBlock!).toMatch(/12s/);
		});
	});

	describe('1.3 fog-drift 擬似要素 2 層', () => {
		it('@keyframes fog-drift を定義する', () => {
			expect(stripped).toMatch(/@keyframes\s+fog-drift\s*\{/);
		});

		it('.theme-root::before と ::after の両方で霧レイヤーを構成する', () => {
			const before = findBlock(stripped, /\.theme-root::before\s*\{/);
			const after = findBlock(stripped, /\.theme-root::after\s*\{/);
			expect(before, '::before が定義されていない').not.toBeNull();
			expect(after, '::after が定義されていない').not.toBeNull();
			expect(before!).toMatch(/fog-drift/);
			expect(after!).toMatch(/fog-drift/);
		});

		it('擬似要素は pointer-events: none を必ず指定する', () => {
			const before = findBlock(stripped, /\.theme-root::before\s*\{/);
			const after = findBlock(stripped, /\.theme-root::after\s*\{/);
			expect(before!).toMatch(/pointer-events\s*:\s*none/);
			expect(after!).toMatch(/pointer-events\s*:\s*none/);
		});
	});

	describe('1.4 テーマ対象をメモ編集面に限定する（friction log: ヘッダー文字消失対策）', () => {
		// 旧仕様は .app-header / .app-sidebar / 汎用 button・input・a へ配色していたが、
		// (1) .app-header / .app-sidebar クラスはコンポーネントに存在せず空振り、
		// (2) .theme-root button が Tailwind text-gray-600 に勝ち、白背景ヘッダーの
		//     ナビ文字がほぼ白になって消える、という不具合を生んでいた。
		// 他14テーマと同様、テーマ対象は .memo-title / .memo-content に限定する。
		it('実在しないアプリ枠クラス (.app-header / .app-sidebar) を参照しない', () => {
			expect(stripped).not.toMatch(/\.app-header\b/);
			expect(stripped).not.toMatch(/\.app-sidebar\b/);
		});

		it.each([['button'], ['input'], ['textarea']])(
			'要素型セレクタ .theme-root %s でアプリ全体へ配色を漏らさない',
			(selector) => {
				expect(stripped).not.toMatch(new RegExp(`\\.theme-root\\s+${selector}\\b`));
			},
		);

		it('汎用リンク (.theme-root a) には配色せず、メモ本文内リンクのみ許容する', () => {
			// .theme-root .memo-content a は許容。直下の .theme-root a は不可。
			expect(stripped).not.toMatch(/\.theme-root\s+a\b/);
			expect(stripped).toMatch(/\.theme-root\s+\.memo-content\s+a\b/);
		});

		it('テーマ対象はメモ編集面 (.memo-title / .memo-content) に限定する', () => {
			expect(stripped).toMatch(/\.theme-root\s+\.memo-title\b/);
			expect(stripped).toMatch(/\.theme-root\s+\.memo-content\b/);
		});
	});

	describe('1.5 prefers-reduced-motion: reduce 対応', () => {
		it('prefers-reduced-motion: reduce メディアクエリを含む', () => {
			expect(stripped).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/);
		});

		it('reduced-motion ブロック内でアニメーションを停止する', () => {
			const block = findBlock(stripped, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/);
			expect(block, '@media ブロックが取得できない').not.toBeNull();
			expect(block!).toMatch(/animation\s*:\s*none/);
		});

		it('アニメ停止後も森パレット（背景色）を維持するセレクタが存在する', () => {
			// @media 外の .theme-root 定義で background を明示
			const rootBlock = findBlock(stripped, /\.theme-root\s*\{/);
			expect(rootBlock!).toMatch(/background/);
		});
	});

	describe('1.6 他テーマ非干渉の CSS レベル検証', () => {
		it('トップレベルの全セレクタが .theme-root スコープまたは @ルールに限定される', () => {
			// 最上位ブロックのみを検証する（@media 内などはスキップ）
			let depth = 0;
			let sliceStart = 0;
			const topLevelHeaders: string[] = [];
			for (let i = 0; i < stripped.length; i++) {
				const ch = stripped[i];
				if (ch === '{') {
					if (depth === 0) {
						topLevelHeaders.push(stripped.slice(sliceStart, i).trim());
					}
					depth += 1;
				} else if (ch === '}') {
					depth -= 1;
					if (depth === 0) sliceStart = i + 1;
				}
			}

			for (const header of topLevelHeaders) {
				if (!header) continue;
				if (header.startsWith('@')) continue;
				// セレクタグループはカンマ区切りで評価
				for (const part of header
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)) {
					expect(part.startsWith('.theme-root'), `非スコープセレクタ: "${part}"`).toBe(true);
				}
			}
		});

		it.each(OTHER_THEMES.map((name) => [name]))('他テーマ %s.css を参照しない', (name) => {
			expect(stripped).not.toContain(`${name}.css`);
			expect(stripped).not.toContain(`/themes/${name}`);
		});
	});

	describe('5.1 森固有リッチテクスチャ（Layer③ / mori 有効時のみ fetch）', () => {
		it('プリミティブ面（.shell-surface / .shell-panel / .shell-card）へクラス選択子でテクスチャを付与する', () => {
			expect(stripped).toMatch(/\.theme-root\s+\.shell-surface\b/);
			expect(stripped).toMatch(/\.theme-root\s+\.shell-panel\b/);
			expect(stripped).toMatch(/\.theme-root\s+\.shell-card\b/);
		});

		it('多層グラデ＋内側ハイライト＋noise を background-image に重ねる', () => {
			const block = findBlock(stripped, /\.theme-root\s+\.shell-card\s*\{/);
			expect(block, 'リッチテクスチャブロックが取得できない').not.toBeNull();
			expect(block!).toMatch(/background-image\s*:/);
			// 木漏れ日（径グラデ）＋内側ハイライト/沈み込み（線グラデ複数）＝多層
			expect(block!).toMatch(/radial-gradient/);
			expect((block!.match(/linear-gradient/g) ?? []).length).toBeGreaterThanOrEqual(2);
			// noise は変数経由で重ねる
			expect(block!).toMatch(/var\(--mori-noise\)/);
		});

		it('自己完結の data-URI noise（feTurbulence）を定義し、外部リソースを使わない', () => {
			expect(stripped).toMatch(/--mori-noise\s*:/);
			expect(stripped).toContain('data:image/svg+xml');
			expect(stripped).toMatch(/feTurbulence|fractalNoise/);
		});

		it('色・構造トークン値を Layer③ で再定義しない（Layer① を単一の源泉に保つ）', () => {
			// シェルトークン（tokens.css 所有）を mori.css 側で上書きしないこと（半テーマ窓回避 / 7.5）
			const shellTokens = [
				'--surface',
				'--on-surface',
				'--surface-variant',
				'--accent',
				'--outline',
				'--focus-ring',
				'--elevation-1',
				'--elevation-2',
				'--elevation-3',
				'--state-hover',
				'--state-selected',
			];
			for (const token of shellTokens) {
				expect(stripped, `${token} を Layer③ で再定義している`).not.toMatch(
					new RegExp(`${token}\\s*:`),
				);
			}
		});
	});

	describe('5.2 本文面の温存と CSS 契約（要素型禁止 / .theme-root スコープ / .shell-* 許容）', () => {
		it('本文面（.memo-title / .memo-content）配下の主要スタイルを温存する（後退させない）', () => {
			expect(stripped).toMatch(/\.theme-root\s+\.memo-title\b/);
			expect(stripped).toMatch(/\.theme-root\s+\.memo-content\b/);
			for (const child of ['h1', 'h2', 'blockquote', 'pre', 'code']) {
				expect(stripped, `.memo-content ${child} のスタイルが後退`).toMatch(
					new RegExp(`\\.memo-content\\s+${child}\\b`),
				);
			}
			// 本文内リンクは許容（汎用 .theme-root a は 1.4 で禁止）
			expect(stripped).toMatch(/\.theme-root\s+\.memo-content\s+a\b/);
		});

		it('リッチパックでプリミティブ系クラス（.shell-*）を .theme-root スコープで許容する', () => {
			expect(stripped).toMatch(/\.theme-root\s+\.shell-[a-z-]+/);
		});
	});
});

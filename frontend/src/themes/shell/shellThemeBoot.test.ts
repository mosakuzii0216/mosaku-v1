import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { bootShellTheme } from './shellThemeBoot';
import { CRITICAL_THEME_VARS, SHELL_THEME_STORAGE_KEY } from './shellThemeCritical';

/*
 * shellThemeBoot.test.ts — 起動時ブート＋インライン適合（Task 3.3 / RED→GREEN）
 * ===============================================================================
 * 何を守るテストか:
 *   FOUC ゼロ（2.3）。first paint 前に永続テーマを同期適用し、白フラッシュを消す。
 *   2 系統で実現する:
 *     (a) index.html の <head> インライン classic script（render-blocking, first paint 前）
 *     (b) main.tsx から呼ぶ bootShellTheme()（module 側の DRY 再利用・属性既設なら冪等）
 *   検証する不変則:
 *     - bootShellTheme は永続値どおりに <html> を再構成し、冪等（二度呼んでも同結果）。
 *     - インラインの mori 値は CRITICAL_THEME_VARS.mori と一致（手書きと TS の drift 検出）。
 *     - インラインは依存ゼロ・例外安全（try/catch）で、永続キーを参照する。
 *     - main.tsx が bootShellTheme を呼ぶ（runtime 経路でも適用が成立する）。
 *
 * Requirements: 2.3
 */

const INDEX_HTML = readFileSync(resolve(__dirname, '../../../index.html'), 'utf-8');
const MAIN_TSX = readFileSync(resolve(__dirname, '../../main.tsx'), 'utf-8');

const normalize = (v: string): string => v.replace(/\s+/g, '');

describe('bootShellTheme — module 側の起動適用（冪等）', () => {
	beforeEach(() => {
		localStorage.clear();
		const el = document.documentElement;
		el.removeAttribute('data-theme');
		el.removeAttribute('style');
	});

	it('永続 mori があれば <html> に data-theme と地色を適用する', () => {
		localStorage.setItem(SHELL_THEME_STORAGE_KEY, JSON.stringify({ id: 't', slug: 'mori' }));
		bootShellTheme();
		const el = document.documentElement;
		expect(el.getAttribute('data-theme')).toBe('mori');
		expect(el.style.backgroundColor).not.toBe('');
	});

	it('永続値が無ければ data-theme を付けない（中立既定）', () => {
		bootShellTheme();
		expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
	});

	it('冪等: 二度呼んでも結果が一致する（属性既設でも壊れない）', () => {
		localStorage.setItem(SHELL_THEME_STORAGE_KEY, JSON.stringify({ id: 't', slug: 'mori' }));
		bootShellTheme();
		bootShellTheme();
		expect(document.documentElement.getAttribute('data-theme')).toBe('mori');
		expect(document.documentElement.style.getPropertyValue('--shell-base-bg')).toBe(
			CRITICAL_THEME_VARS.mori['--shell-base-bg'],
		);
	});

	it('永続が消えた状態で呼ぶと stale な data-theme を中立既定へ戻す', () => {
		document.documentElement.setAttribute('data-theme', 'mori'); // stale
		bootShellTheme(); // localStorage は空
		expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
	});
});

describe('index.html インラインブート（FOUC の本体・render-blocking）', () => {
	it('永続キー mosaku.shell-theme を参照するインラインスクリプトを持つ', () => {
		expect(INDEX_HTML).toContain(SHELL_THEME_STORAGE_KEY);
		expect(INDEX_HTML).toMatch(/<script>[\s\S]*<\/script>/);
	});

	it('data-theme を設定する', () => {
		expect(INDEX_HTML).toMatch(/setAttribute\(\s*['"]data-theme['"]/);
	});

	it('例外安全（try/catch）で依存ゼロである', () => {
		// インライン script ブロックを抽出し、その中に try/catch があることを確認
		const inline = INDEX_HTML.match(/<script>([\s\S]*?)<\/script>/);
		expect(inline, 'インライン script が無い').not.toBeNull();
		const body = (inline as RegExpMatchArray)[1];
		expect(body).toMatch(/try\s*\{/);
		expect(body).toMatch(/catch\s*\(/);
		// import を持たない（first paint 前の classic script ＝ 依存ゼロ）
		expect(body).not.toMatch(/\bimport\b/);
	});

	it('mori の critical 値が CRITICAL_THEME_VARS.mori と一致する（手書き×TS の drift 検出）', () => {
		const flat = normalize(INDEX_HTML);
		for (const value of Object.values(CRITICAL_THEME_VARS.mori)) {
			expect(flat, `インラインに mori 値 "${value}" が無い／不一致`).toContain(normalize(value));
		}
	});
});

describe('main.tsx は bootShellTheme を呼ぶ（runtime 経路の DRY 再利用）', () => {
	it('shellThemeBoot を import して bootShellTheme() を呼び出す', () => {
		expect(MAIN_TSX).toMatch(/shellThemeBoot/);
		expect(MAIN_TSX).toMatch(/bootShellTheme\(\)/);
	});
});

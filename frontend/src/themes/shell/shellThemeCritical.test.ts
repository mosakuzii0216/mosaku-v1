import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	CRITICAL_THEME_VARS,
	SHELL_THEME_STORAGE_KEY,
	readPersistedShellTheme,
	writePersistedShellTheme,
	applyCriticalTheme,
} from './shellThemeCritical';

/*
 * shellThemeCritical.test.ts — Critical Vars マップ＋即時適用ユーティリティ（Task 3.1 / RED→GREEN）
 * ===============================================================================
 * 何を守るテストか:
 *   FOUC ゼロ（2.3）の belt-and-suspenders 層（Layer②）。first paint 前に <html> の
 *   data-theme と地色を確定するための「極小マップ＋同期適用」を検証する。
 *   不変則:
 *     - critical マップは surface / on-surface / --shell-base-bg のみ（accent/outline/elevation を
 *       持たない＝半テーマ窓を作らない / 設計「層所有」表 Layer②）。
 *     - critical の mori 値は tokens.css [data-theme="mori"]（色トークンの単一の源泉 / Layer①）と
 *       一致する（drift をこのテストで機械検出する）。
 *     - 永続読み出し／適用は例外安全（localStorage 不可・破損で throw せず中立既定へ）。
 *
 * Requirements: 2.3（FOUC）, 6.4（他 3 テーマは placeholder）, 7.3（localStorage 永続）
 */

// ---- tokens.css パース（drift guard 用） --------------------------------------

const TOKENS_CSS = readFileSync(resolve(__dirname, './tokens.css'), 'utf-8');

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
			if (depth === 0) return input.slice(braceStart + 1, i);
		}
	}
	return null;
}

function extractVar(block: string, name: string): string | null {
	const m = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
	return m ? m[1].trim() : null;
}

const normalize = (v: string): string => v.replace(/\s+/g, '');

// ---- テスト本体 ---------------------------------------------------------------

describe('CRITICAL_THEME_VARS — critical マップの契約', () => {
	it('mori は surface / on-surface / --shell-base-bg のちょうど 3 キーのみを持つ', () => {
		expect(Object.keys(CRITICAL_THEME_VARS.mori).sort()).toEqual(
			['--on-surface', '--shell-base-bg', '--surface'].sort(),
		);
	});

	it('mori は accent/outline/elevation を持たない（半テーマ窓を作らない / Layer②）', () => {
		expect(CRITICAL_THEME_VARS.mori).not.toHaveProperty('--accent');
		expect(CRITICAL_THEME_VARS.mori).not.toHaveProperty('--outline');
		expect(CRITICAL_THEME_VARS.mori).not.toHaveProperty('--elevation-1');
	});

	it('umi / yoru / asa は placeholder（空オブジェクト）である（6.4）', () => {
		expect(CRITICAL_THEME_VARS.umi).toEqual({});
		expect(CRITICAL_THEME_VARS.yoru).toEqual({});
		expect(CRITICAL_THEME_VARS.asa).toEqual({});
	});

	it('mori の critical 値は tokens.css [data-theme="mori"] と一致する（単一の源泉・drift 検出）', () => {
		const moriBlock = findBlock(stripComments(TOKENS_CSS), /\[data-theme=["']?mori["']?\]\s*\{/);
		expect(moriBlock, 'tokens.css に [data-theme="mori"] が無い').not.toBeNull();
		const block = moriBlock as string;

		for (const key of ['--surface', '--on-surface', '--shell-base-bg'] as const) {
			const fromTokens = extractVar(block, key);
			expect(fromTokens, `tokens.css に ${key} が無い`).toBeTruthy();
			expect(
				normalize(CRITICAL_THEME_VARS.mori[key] as string),
				`${key} が tokens.css と critical マップで不一致`,
			).toBe(normalize(fromTokens as string));
		}
	});
});

describe('readPersistedShellTheme — 永続テーマの同期読み出し（例外安全）', () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => {
		vi.restoreAllMocks();
		localStorage.clear();
	});

	it('未保存なら null を返す', () => {
		expect(readPersistedShellTheme()).toBeNull();
	});

	it('正しい JSON を保存していれば selection を返す', () => {
		localStorage.setItem(SHELL_THEME_STORAGE_KEY, JSON.stringify({ id: 'theme-1', slug: 'mori' }));
		expect(readPersistedShellTheme()).toEqual({ id: 'theme-1', slug: 'mori' });
	});

	it('破損 JSON では null を返す（throw しない）', () => {
		localStorage.setItem(SHELL_THEME_STORAGE_KEY, '{not json');
		expect(readPersistedShellTheme()).toBeNull();
	});

	it('値域外の slug では null を返す（slug 偽装を無効化）', () => {
		localStorage.setItem(SHELL_THEME_STORAGE_KEY, JSON.stringify({ id: 'x', slug: 'rainbow' }));
		expect(readPersistedShellTheme()).toBeNull();
	});

	it('id 欠落では null を返す', () => {
		localStorage.setItem(SHELL_THEME_STORAGE_KEY, JSON.stringify({ slug: 'mori' }));
		expect(readPersistedShellTheme()).toBeNull();
	});

	it('localStorage アクセスが throw しても null を返す（プライベートモード等）', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('SecurityError');
		});
		expect(readPersistedShellTheme()).toBeNull();
	});
});

describe('writePersistedShellTheme — 永続書き込み（例外安全）', () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => {
		vi.restoreAllMocks();
		localStorage.clear();
	});

	it('selection を JSON で localStorage へ書き込む', () => {
		writePersistedShellTheme({ id: 'theme-1', slug: 'mori' });
		expect(JSON.parse(localStorage.getItem(SHELL_THEME_STORAGE_KEY) as string)).toEqual({
			id: 'theme-1',
			slug: 'mori',
		});
	});

	it('null でキーを削除する', () => {
		localStorage.setItem(SHELL_THEME_STORAGE_KEY, JSON.stringify({ id: 'x', slug: 'mori' }));
		writePersistedShellTheme(null);
		expect(localStorage.getItem(SHELL_THEME_STORAGE_KEY)).toBeNull();
	});

	it('setItem が throw しても例外を投げない（in-memory フォールバックは store 側が担保）', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('QuotaExceededError');
		});
		expect(() => writePersistedShellTheme({ id: 'x', slug: 'mori' })).not.toThrow();
	});
});

describe('applyCriticalTheme — first paint 前のルート即時適用', () => {
	beforeEach(() => {
		const el = document.documentElement;
		el.removeAttribute('data-theme');
		el.removeAttribute('style');
	});

	it('mori で data-theme と critical vars と <html> 地色を設定する', () => {
		applyCriticalTheme('mori');
		const el = document.documentElement;
		expect(el.getAttribute('data-theme')).toBe('mori');
		expect(el.style.getPropertyValue('--surface').replace(/\s+/g, '')).toBe(
			normalize(CRITICAL_THEME_VARS.mori['--surface'] as string),
		);
		expect(el.style.getPropertyValue('--on-surface')).toBe(
			CRITICAL_THEME_VARS.mori['--on-surface'],
		);
		expect(el.style.getPropertyValue('--shell-base-bg')).toBe(
			CRITICAL_THEME_VARS.mori['--shell-base-bg'],
		);
		// belt-and-suspenders: var 消費 CSS が無くても <html> が実際に地色で塗られる
		expect(el.style.backgroundColor).not.toBe('');
	});

	it('null で data-theme と critical vars を除去する', () => {
		applyCriticalTheme('mori');
		applyCriticalTheme(null);
		const el = document.documentElement;
		expect(el.hasAttribute('data-theme')).toBe(false);
		expect(el.style.getPropertyValue('--surface')).toBe('');
		expect(el.style.getPropertyValue('--shell-base-bg')).toBe('');
		expect(el.style.backgroundColor).toBe('');
	});

	it('テーマ切替（mori→null→他）で前テーマの critical vars が残らない', () => {
		applyCriticalTheme('mori');
		applyCriticalTheme('umi'); // placeholder（値なし）
		const el = document.documentElement;
		expect(el.getAttribute('data-theme')).toBe('umi');
		// umi は placeholder ＝ mori の値が残っていてはいけない
		expect(el.style.getPropertyValue('--surface')).toBe('');
		expect(el.style.getPropertyValue('--shell-base-bg')).toBe('');
		expect(el.style.backgroundColor).toBe('');
	});

	it('placeholder slug（umi）は data-theme のみ設定し vars は付けない', () => {
		applyCriticalTheme('umi');
		const el = document.documentElement;
		expect(el.getAttribute('data-theme')).toBe('umi');
		expect(el.style.getPropertyValue('--surface')).toBe('');
	});
});

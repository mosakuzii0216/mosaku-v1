import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/*
 * appShell.test.ts — アプリシェルのルート面契約（theme-immersive-world / Task 4.1）
 * ==============================================================================
 * 何を守るテストか:
 *   玄関のルート（DesktopLayout / MobileLayout）は不透明な bg-white を .app-shell へ置換する。
 *   .app-shell は「中立では地色（今日の白）を敷き、テーマ適用時は透過して MoriEffectLayer /
 *   <html> 地色を一本のソースとして透かす」ことで、シェルが不透明グラデ板を二重に描く問題
 *   （design G-4）を構造的に防ぐ。色トークンの単一の源泉（tokens.css）に値を置き、
 *   primitives.css は var(--app-shell-bg) を読むだけの theme-neutral 構造に保つ（1.4）。
 *
 * Requirements: 2.2（bg-white を surface へ）, 2.4（Desktop/Mobile 両対応）,
 *   5.2（玄関〜本文の連続性 / 生きた背景の透過）, 7.1（中立は実装前と同一描画）
 */

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

const primitives = stripComments(readFileSync(resolve(__dirname, './primitives.css'), 'utf-8'));
const tokens = stripComments(readFileSync(resolve(__dirname, './tokens.css'), 'utf-8'));

describe('app-shell ルート面の契約（Task 4.1 / 二重背景回避）', () => {
	it('primitives.css は .app-shell ルールを定義する', () => {
		expect(primitives, '.app-shell が未定義').toMatch(/\.app-shell\s*[,{]/);
	});

	it('.app-shell の地は var(--app-shell-bg) で解決する（生カラーリテラルを直書きしない / 1.4）', () => {
		const body = findBlockBody(primitives, /\.app-shell\s*\{/) ?? '';
		expect(body).toMatch(/background(-color)?\s*:\s*var\(--app-shell-bg\)/);
	});

	it('中立既定（:root）の --app-shell-bg は地色を持ち透過しない（今日の白を保つ / 7.1）', () => {
		const root = findBlockBody(tokens, /:root\s*\{/) ?? '';
		expect(root, ':root に --app-shell-bg が未定義').toMatch(/--app-shell-bg\s*:/);
		expect(root, '中立で透過すると今日の白背景が崩れる').not.toMatch(
			/--app-shell-bg\s*:\s*transparent/,
		);
	});

	it('mori は --app-shell-bg: transparent で生きた背景を透かす（二重背景回避 / G-4, 5.2）', () => {
		const mori = findBlockBody(tokens, /\[data-theme=['"]mori['"]\]\s*\{/) ?? '';
		expect(mori, 'mori で --app-shell-bg が transparent でない').toMatch(
			/--app-shell-bg\s*:\s*transparent/,
		);
	});
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/*
 * layer-boundary-guard.test.ts — Layer①（操作面）と Layer③（本文面）の責務境界ガード
 * ===============================================================================
 * 何を守るテストか:
 *   editor-surface-tokenization で新設した操作面プリミティブ（.shell-popover /
 *   .shell-popover-item / .shell-scrim / .shell-prose-host / トグル状態 /
 *   無効状態）と意味色トークン（--danger / --success / --scrim 系）の色・状態を、
 *   Layer③（public/themes/mori/mori.css）が後から再定義して二重管理化する経路を
 *   機械的に封じる（Req5.3: 同一の視覚プロパティを両層で定義しない）。
 *
 *   theme-immersive-world 由来の .shell-surface / .shell-panel / .shell-card への
 *   テクスチャ重ね（background-image のみ）は Layer①の色を上書きしない既存の
 *   許容パターンであり mori.css.test.ts が別途検証済み。本テストはそれを禁止しない。
 *   ただし「面の質感のみ（background-image 系）」を超えて color / background-color /
 *   border-color / box-shadow を宣言していないことは、既存パターンも含め機械検証する。
 *
 * editor-surface-tokenization Task 7.1
 * Requirements: 5.3
 */

const MORI_CSS_PATH = resolve(__dirname, '../../../public/themes/mori/mori.css');
const css = readFileSync(MORI_CSS_PATH, 'utf-8');

function stripComments(input: string): string {
	return input.replace(/\/\*[\s\S]*?\*\//g, '');
}

const stripped = stripComments(css);

/**
 * 本スペックが新設した操作面プリミティブのセレクタ／状態属性。
 * いずれも Layer①（primitives.css）が色と質感を持ち切る契約のため、
 * Layer③ 側に同名セレクタが一切現れないことを機械検証する。
 */
const NEW_OPERATIONAL_SELECTORS = [
	'.shell-popover',
	'.shell-popover-item',
	'.shell-scrim',
	'.shell-prose-host',
	"[aria-pressed='true']",
	'.shell-button:disabled',
	'.shell-button-primary:disabled',
];

/** 本スペックで語彙へ追加した意味色トークン（9役割）。Layer③ での再定義を禁止する。 */
const NEW_SEMANTIC_TOKENS = [
	'--danger',
	'--on-danger',
	'--danger-container',
	'--on-danger-container',
	'--success',
	'--on-success',
	'--success-container',
	'--on-success-container',
	'--scrim',
];

/** 面の質感（テクスチャ）としてのみ許容するプロパティ。色の所有権を示すプロパティは禁止する。 */
const OPERATIONAL_COLOR_PROPERTIES = ['color', 'background-color', 'border-color', 'box-shadow'];

function findAllBlocks(input: string, selectorPattern: RegExp): string[] {
	const blocks: string[] = [];
	let match: RegExpExecArray | null;
	const re = new RegExp(
		selectorPattern.source,
		selectorPattern.flags.includes('g') ? selectorPattern.flags : `${selectorPattern.flags}g`,
	);
	while ((match = re.exec(input)) !== null) {
		const braceStart = input.indexOf('{', match.index);
		if (braceStart === -1) continue;
		let depth = 0;
		for (let i = braceStart; i < input.length; i++) {
			if (input[i] === '{') depth += 1;
			else if (input[i] === '}') {
				depth -= 1;
				if (depth === 0) {
					blocks.push(input.slice(braceStart + 1, i));
					break;
				}
			}
		}
	}
	return blocks;
}

describe('Layer Boundary Guard — Layer③（mori.css）は操作面プリミティブの色を越境しない（5.3）', () => {
	it.each(NEW_OPERATIONAL_SELECTORS)(
		'mori.css は新設プリミティブ %s のセレクタを持たない',
		(selector) => {
			expect(stripped, `${selector} が mori.css に越境している`).not.toContain(selector);
		},
	);

	it.each(NEW_SEMANTIC_TOKENS)('mori.css は意味色トークン %s の値を再定義しない', (token) => {
		expect(stripped, `${token} を Layer③ で再定義している`).not.toMatch(
			new RegExp(`${token}\\s*:`),
		);
	});

	it('mori.css 内の .shell-* セレクタブロックは面の質感（background-image 系）のみを宣言し、操作色プロパティを持たない', () => {
		const blocks = findAllBlocks(
			stripped,
			/\.theme-root\s+\.shell-[a-z-]+(?:,\s*\.theme-root\s+\.shell-[a-z-]+)*\s*\{/g,
		);
		expect(blocks.length, 'mori.css に .shell-* ブロックが見つからない').toBeGreaterThan(0);
		for (const block of blocks) {
			for (const prop of OPERATIONAL_COLOR_PROPERTIES) {
				expect(block, `.shell-* ブロックが操作色プロパティ ${prop} を宣言している`).not.toMatch(
					new RegExp(`(?<![a-z-])${prop}\\s*:`),
				);
			}
		}
	});
});

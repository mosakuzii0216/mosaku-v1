import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/*
 * editor-surface-literal-guard.test.ts — 対象8面の生 Tailwind 配色残存ガード
 * ===============================================================================
 * 何を守るテストか:
 *   エディタ中核3面と周辺5面の**ソースファイル**を直接読み、生の Tailwind 配色
 *   ユーティリティ（bg-white / text-gray-* / bg-blue-* / border-gray-* 等）の
 *   マッチが0件であることを検証する。
 *
 *   レンダー結果ではなくソースを走査する理由: 既定のレンダー経路に現れない分岐
 *   （トースト・公開中ピル・空状態・期限警告・パレットのノートブックモード・
 *   「コマンドへ戻る」）や、editorProps.attributes.class のような文字列内に埋まる
 *   固定色を、要素単位の検査では取りこぼすため（Req1.4 は「ファイルに残存したら
 *   失敗させる」ことを要求する）。
 *
 *   着手時点（editor-surface-tokenization Task 5 着手時）の残存は164件。
 *   Task 5（一次対象3面）・Task 6（周辺5面）が進むにつれ0へ収束し、Task 6 完了時点で
 *   全ファイル0件になることを本ガードで確認する（手動での目視カウントに依存しない）。
 *   8ファイルを一度に登録するため Task 6 完了までは意図的な RED として置く。
 *
 * editor-surface-tokenization Task 5.1
 * Requirements: 1.4, 8.5
 */

const FRONTEND_SRC = resolve(__dirname, '../..');

const TARGET_FILES = [
	'components/editor/RichTextEditor.tsx',
	'components/editor/EditorBubbleMenu.tsx',
	'components/editor/SlashCommandList.tsx',
	'components/memo/MemoPalette.tsx',
	'components/memo/ShareMemoControl.tsx',
	'components/memo/TrashView.tsx',
	'components/memo/MemoSearch.tsx',
	'components/memo/MemoEditor.tsx',
];

/**
 * レイアウト・寸法系ユーティリティ（max-h-* / overflow-* / px-* / flex 等）は
 * 据え置き対象のため対象外。配色ユーティリティ（地・文字・境界・区切り・
 * プレースホルダ・リング）× 生カラー語彙のみを対象とする。
 */
const RAW_TAILWIND_COLOR_PATTERN =
	/\b(bg|text|border|divide|placeholder|ring)-(white|black|gray|blue|red|green|yellow|indigo|slate)(-\d{2,3})?\b/g;

function readTarget(relativePath: string): string {
	return readFileSync(resolve(FRONTEND_SRC, relativePath), 'utf-8');
}

describe('Editor Surface Literal Guard — 対象8面のソースに生 Tailwind 配色が残存しない（1.4, 8.5）', () => {
	it.each(TARGET_FILES)('%s に生 Tailwind 配色ユーティリティが残存しない', (relativePath) => {
		const source = readTarget(relativePath);
		const matches = source.match(RAW_TAILWIND_COLOR_PATTERN) ?? [];
		expect(
			matches,
			`生 Tailwind 配色が ${matches.length} 件残存: ${matches.join(', ')}`,
		).toHaveLength(0);
	});

	it('対象8面すべてで残存が0件になる（着手時164件からの収束）', () => {
		const total = TARGET_FILES.reduce((sum, relativePath) => {
			const source = readTarget(relativePath);
			return sum + (source.match(RAW_TAILWIND_COLOR_PATTERN) ?? []).length;
		}, 0);
		expect(total).toBe(0);
	});
});

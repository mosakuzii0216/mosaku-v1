import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/*
 * layer-weight.test.ts — Layer①（tokens.css / primitives.css）の軽量性ガード
 * ===============================================================================
 * 何を守るテストか:
 *   Layer①は全ユーザーへ配られる bundle（render-blocking）のため、色・状態・構造の
 *   宣言のみで構成され、テクスチャ画像・data-URI・独自フォント埋め込み等の重量物を
 *   持たないことを機械検証する。あわせて外部 JS ライブラリの新規追加が無いことを固定する。
 *
 * editor-surface-tokenization Task 2.3
 * Requirements: 5.5（重量物排除）, 8.2（新規依存ゼロ・バンドル不増）
 */

const SHELL_DIR = resolve(__dirname, '.');
const PACKAGE_JSON_PATH = resolve(__dirname, '../../../package.json');

function readShellFile(name: string): string {
	return readFileSync(resolve(SHELL_DIR, name), 'utf-8');
}

/**
 * editor-surface-tokenization 着手時点（Task 2.3）で固定した dependencies 一覧。
 * ここに無い依存が package.json に増えたら本テストが落ち、追加の妥当性確認を要求する（8.2）。
 * 意図的な追加であればこの一覧を更新すること。
 */
const FROZEN_DEPENDENCIES = [
	'@hookform/resolvers',
	'@sentry/react',
	'@tanstack/react-query',
	'@tiptap/extension-code-block-lowlight',
	'@tiptap/extension-details',
	'@tiptap/extension-highlight',
	'@tiptap/extension-list',
	'@tiptap/extension-mention',
	'@tiptap/extension-placeholder',
	'@tiptap/extension-table',
	'@tiptap/extension-text-style',
	'@tiptap/pm',
	'@tiptap/react',
	'@tiptap/starter-kit',
	'@tiptap/suggestion',
	'idb',
	'lowlight',
	'lucide-react',
	'react',
	'react-dom',
	'react-hook-form',
	'react-router',
	'tippy.js',
	'zod',
	'zustand',
].sort();

describe('Layer Weight Guard — tokens.css / primitives.css は重量物を含まない（5.5）', () => {
	it.each(['tokens.css', 'primitives.css'])('%s は data: URI を含まない', (file) => {
		expect(readShellFile(file)).not.toMatch(/data:/);
	});

	it.each(['tokens.css', 'primitives.css'])('%s は url() を含まない', (file) => {
		expect(readShellFile(file)).not.toMatch(/url\(/);
	});

	it.each(['tokens.css', 'primitives.css'])('%s は @font-face を含まない', (file) => {
		expect(readShellFile(file)).not.toContain('@font-face');
	});
});

describe('Layer Weight Guard — 外部 JS ライブラリの新規追加ゼロ（8.2）', () => {
	it('frontend/package.json の dependencies が着手時点の一覧と一致する', () => {
		const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as {
			dependencies?: Record<string, string>;
		};
		const current = Object.keys(pkg.dependencies ?? {}).sort();
		expect(
			current,
			'dependencies に変更が検出された。意図的な追加なら FROZEN_DEPENDENCIES を更新すること',
		).toEqual(FROZEN_DEPENDENCIES);
	});
});

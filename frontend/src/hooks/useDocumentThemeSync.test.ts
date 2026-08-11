import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocumentThemeSync } from './useDocumentThemeSync';
import { applyCriticalTheme } from '../themes/shell/shellThemeCritical';
import type { ActiveTheme } from './useActiveTheme';

/*
 * useDocumentThemeSync.test.ts — 文書ルートのテーマ源泉一本化（Task 3 / RED→GREEN）
 * ============================================================================
 * 何を守るテストか:
 *   in-tree（シェルルート div）と body ポータル（スラッシュ候補等）が同一の
 *   トークン解決結果を見る状態を保証する post-mount 再整合フック。
 *   起動時同期（shellThemeBoot）には触れず、applyCriticalTheme の冪等性へ委ねる。
 *
 * Requirements: 3.1, 7.2
 */

const moriTheme = { id: 'theme-mori', metadata: { effectKey: 'mori' } } as unknown as ActiveTheme;
const umiTheme = { id: 'theme-umi', metadata: { effectKey: 'umi' } } as unknown as ActiveTheme;

describe('useDocumentThemeSync', () => {
	beforeEach(() => {
		const el = document.documentElement;
		el.removeAttribute('data-theme');
		el.removeAttribute('style');
	});

	it('文脈テーマが床より優先される（床適用済みの状態を解決済みテーマで上書きする）', () => {
		// シェル床（umi）が起動時同期で先に適用済みという状態を模す
		applyCriticalTheme('umi');
		expect(document.documentElement.getAttribute('data-theme')).toBe('umi');

		// 文脈テーマ（mori）が解決された後にフックが再整合する
		renderHook(() => useDocumentThemeSync(moriTheme));

		expect(document.documentElement.getAttribute('data-theme')).toBe('mori');
		expect(document.documentElement.style.getPropertyValue('--on-surface')).toBe('#e8f6ee');
	});

	it('未設定（null）で data-theme 属性が除去される', () => {
		applyCriticalTheme('mori');
		expect(document.documentElement.hasAttribute('data-theme')).toBe(true);

		renderHook(() => useDocumentThemeSync(null));

		expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
		expect(document.documentElement.style.getPropertyValue('--surface')).toBe('');
	});

	it('同一 slug の再適用が冪等（rerender で属性・critical 変数が変化しない）', () => {
		const { rerender } = renderHook(({ theme }) => useDocumentThemeSync(theme), {
			initialProps: { theme: moriTheme },
		});

		const before = {
			dataTheme: document.documentElement.getAttribute('data-theme'),
			onSurface: document.documentElement.style.getPropertyValue('--on-surface'),
		};

		rerender({ theme: moriTheme });

		expect(document.documentElement.getAttribute('data-theme')).toBe(before.dataTheme);
		expect(document.documentElement.style.getPropertyValue('--on-surface')).toBe(before.onSurface);
	});

	it('値未実装テーマ（umi）は data-theme は付くが critical 変数は空になり中立へフォールバックする', () => {
		renderHook(() => useDocumentThemeSync(umiTheme));

		expect(document.documentElement.getAttribute('data-theme')).toBe('umi');
		expect(document.documentElement.style.getPropertyValue('--surface')).toBe('');
		expect(document.documentElement.style.getPropertyValue('--on-surface')).toBe('');
		expect(document.documentElement.style.backgroundColor).toBe('');
	});
});

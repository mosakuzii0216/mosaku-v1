import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useShellThemeStore, resetShellThemeStoreForTest } from './useShellThemeStore';
import { SHELL_THEME_STORAGE_KEY } from '../themes/shell/shellThemeCritical';

/*
 * useShellThemeStore.test.ts — アプリ単位シェルテーマの永続ストア（Task 3.2 / RED→GREEN）
 * ===============================================================================
 * 何を守るテストか:
 *   「開いた瞬間に森」（2.1）の出どころ＝アプリ単位の選択テーマを localStorage 永続で保持する
 *   UI 状態ストア。サーバー状態は持たず（React Query が真実の源泉）、保持するのは「どのテーマを
 *   選んだか」だけ。検証する不変則:
 *     - 初期値は localStorage から同期で確定（first render で決まる）。
 *     - setShellTheme は (1) localStorage 書き込み (2) critical 即時反映 (3) ストア更新を行う。
 *     - localStorage 不可・破損では throw せず in-memory／中立既定へフォールバックする。
 *
 * Requirements: 2.1（アプリ単位テーマの出どころ）, 7.3（localStorage 永続・DB 不変）
 */

describe('useShellThemeStore', () => {
	beforeEach(() => {
		localStorage.clear();
		const el = document.documentElement;
		el.removeAttribute('data-theme');
		el.removeAttribute('style');
		resetShellThemeStoreForTest();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('初期 selection は localStorage の永続値から同期で確定する', () => {
		localStorage.setItem(SHELL_THEME_STORAGE_KEY, JSON.stringify({ id: 'theme-1', slug: 'mori' }));
		resetShellThemeStoreForTest();
		expect(useShellThemeStore.getState().selection).toEqual({ id: 'theme-1', slug: 'mori' });
	});

	it('永続値が無ければ初期 selection は null（中立既定）', () => {
		expect(useShellThemeStore.getState().selection).toBeNull();
	});

	it('破損した永続値では初期 selection は null（throw しない）', () => {
		localStorage.setItem(SHELL_THEME_STORAGE_KEY, '{broken');
		resetShellThemeStoreForTest();
		expect(useShellThemeStore.getState().selection).toBeNull();
	});

	it('setShellTheme は localStorage 書き込み・critical 即時反映・ストア更新を行う', () => {
		useShellThemeStore.getState().setShellTheme({ id: 'theme-1', slug: 'mori' });

		// (3) ストア更新
		expect(useShellThemeStore.getState().selection).toEqual({ id: 'theme-1', slug: 'mori' });
		// (1) localStorage 書き込み
		expect(JSON.parse(localStorage.getItem(SHELL_THEME_STORAGE_KEY) as string)).toEqual({
			id: 'theme-1',
			slug: 'mori',
		});
		// (2) critical 即時反映（<html> に data-theme と地色が乗る）
		expect(document.documentElement.getAttribute('data-theme')).toBe('mori');
		expect(document.documentElement.style.backgroundColor).not.toBe('');
	});

	it('setShellTheme(null) は永続削除・data-theme 除去・ストア null 化を行う', () => {
		useShellThemeStore.getState().setShellTheme({ id: 'theme-1', slug: 'mori' });
		useShellThemeStore.getState().setShellTheme(null);

		expect(useShellThemeStore.getState().selection).toBeNull();
		expect(localStorage.getItem(SHELL_THEME_STORAGE_KEY)).toBeNull();
		expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
	});

	it('localStorage 書き込み不可でも throw せず in-memory state と critical 反映は成立する', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('QuotaExceededError');
		});

		expect(() =>
			useShellThemeStore.getState().setShellTheme({ id: 'theme-1', slug: 'mori' }),
		).not.toThrow();

		// 永続は失敗しても、in-memory の選択と見た目（critical）は成立する
		expect(useShellThemeStore.getState().selection).toEqual({ id: 'theme-1', slug: 'mori' });
		expect(document.documentElement.getAttribute('data-theme')).toBe('mori');
	});

	it('subscribers に selection 変更が通知される', () => {
		const seen: Array<string | null> = [];
		const unsubscribe = useShellThemeStore.subscribe((s) => {
			seen.push(s.selection?.slug ?? null);
		});

		useShellThemeStore.getState().setShellTheme({ id: 'a', slug: 'mori' });
		useShellThemeStore.getState().setShellTheme(null);

		expect(seen).toEqual(['mori', null]);
		unsubscribe();
	});
});

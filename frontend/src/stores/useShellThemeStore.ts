import { create } from 'zustand';
import {
	type ShellThemeSelection,
	applyCriticalTheme,
	readPersistedShellTheme,
	writePersistedShellTheme,
} from '../themes/shell/shellThemeCritical';

/*
 * useShellThemeStore — アプリ単位シェルテーマの永続ストア（UI 状態）
 * ==================================================================
 * 「開いた瞬間に森」（2.1）の出どころ。アプリ単位で選択されたテーマ（id + slug）を
 * localStorage 永続で保持する。サーバー状態（Theme 本体）は持たない＝React Query が
 * 真実の源泉で、ここが保持するのは「どのテーマを選んだか」という UI 選択のみ。
 *
 * 設計上の不変則:
 *   - 初期値は localStorage から同期で読み出し、first render で確定する（FOUC 回避の前提）。
 *   - setShellTheme は (1) 永続書き込み (2) critical 即時反映（<html> へ data-theme・地色）
 *     (3) ストア更新の 3 つを行う。順序は「永続→見た目→状態」。
 *   - localStorage 不可（プライベートモード等）でも throw せず、永続を諦めて in-memory state と
 *     critical 反映だけで継続する（7.3 / quality.md の壊れ方耐性）。
 *
 * persist ミドルウェアは未採用（DB 同期不要・薄い手書き同期で十分）。
 */

interface ShellThemeState {
	selection: ShellThemeSelection | null;
	setShellTheme: (selection: ShellThemeSelection | null) => void;
}

export const useShellThemeStore = create<ShellThemeState>((set) => ({
	// 初期値は localStorage から同期で確定（破損・不可なら null＝中立既定）
	selection: readPersistedShellTheme(),

	setShellTheme: (selection) => {
		// (1) 永続（失敗しても throw しない）
		writePersistedShellTheme(selection);
		// (2) critical 即時反映（React 再レンダ前でも <html> の見た目が確定）
		applyCriticalTheme(selection?.slug ?? null);
		// (3) ストア更新（購読側へ通知）
		set({ selection });
	},
}));

/**
 * テスト専用: localStorage の現在値からストアを再初期化する。
 * （モジュール読み込み時の初期化を、localStorage を仕込んだ後に再現するため）
 */
export function resetShellThemeStoreForTest(): void {
	useShellThemeStore.setState({ selection: readPersistedShellTheme() });
}

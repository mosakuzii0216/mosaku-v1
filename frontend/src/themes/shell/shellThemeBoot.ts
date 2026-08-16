import { applyCriticalTheme, readPersistedShellTheme } from './shellThemeCritical';

/*
 * shellThemeBoot — 起動時テーマ適用（module 側 / DRY 再利用）
 * =========================================================
 * FOUC の本体は index.html の <head> インライン classic script（render-blocking で
 * first paint 前に走る）。本関数はその「同等ロジック」を module 側にも持ち、main.tsx から
 * 呼ぶことで (a) インラインが無い経路（dev HMR 等）でも適用を担保し、(b) 永続値と DOM を
 * 再整合させる。applyCriticalTheme は適用前に critical 変数をクリアするため冪等＝インラインで
 * 既に属性が乗っていても二重適用にならない（設計「import するだけで no-op」）。
 *
 * Requirements: 2.3
 */
export function bootShellTheme(): void {
	applyCriticalTheme(readPersistedShellTheme()?.slug ?? null);
}

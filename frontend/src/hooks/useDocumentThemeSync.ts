import { useEffect } from 'react';
import type { ActiveTheme } from './useActiveTheme';
import { applyCriticalTheme } from '../themes/shell/shellThemeCritical';
import { getEffectKey } from '../types/theme';

/*
 * useDocumentThemeSync — 文書ルートのテーマ源泉一本化（Layer②・Task 3）
 * ============================================================================
 * 役割:
 *   解決済みテーマ（文脈テーマ → シェル床 → null）を <html data-theme> へ再適用し、
 *   in-tree（シェルルート div）と body ポータル（スラッシュ候補等）が同一のトークン
 *   解決結果を見る状態を保証する。
 *
 * 境界:
 *   起動時の同期適用（shellThemeBoot）には触れず post-mount の再整合に徹する
 *   （FOUC ゼロ設計を無改変で維持する）。<html data-theme> のランタイム調停者は
 *   本フックのみとし、呼び出し元は DesktopLayout / MobileLayout の useThemeCSS 直後に限定する。
 *
 * Requirements: 3.1, 7.2
 */
export function useDocumentThemeSync(activeTheme: ActiveTheme | null): void {
	useEffect(() => {
		applyCriticalTheme(getEffectKey(activeTheme) ?? null);
	}, [activeTheme]);
}

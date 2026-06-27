import { useMemoDataStore } from '../stores/useMemoDataStore';
import { useViewStore } from '../stores/useViewStore';
import { useShellThemeStore } from '../stores/useShellThemeStore';
import { useNotebooks } from './useNotebookQueries';
import { useMemo as useMemoQuery } from './useMemoQueries';
import { useThemes } from './useThemeQueries';
import type { Theme } from '../types/theme';

export type ActiveTheme = Pick<Theme, 'id' | 'name' | 'styles' | 'cssFilePath' | 'metadata'>;

/**
 * アクティブテーマを「文脈テーマ → シェル床 → null」の優先順位で解決する。
 *   - 文脈テーマ: 開いているノートブック/メモのテーマ（既存挙動を温存）。
 *   - シェル床: localStorage 永続のアプリ単位テーマ（「開いた瞬間に森」/ 2.1）。選択 id を
 *     useThemes() キャッシュで Theme へ解決し、未充足時は slug 由来の最小テーマで
 *     CSS／エフェクト解決を途切れさせない（1.5）。
 * 解決式: notebookContextTheme ?? shellTheme ?? null。
 */
export function useActiveTheme(): ActiveTheme | null {
	const selectedMemoId = useMemoDataStore((s) => s.selectedMemoId);
	const selectedNotebookId = useMemoDataStore((s) => s.selectedNotebookId);
	const notebookFilter = useViewStore((s) => s.notebookFilter);
	const shellSelection = useShellThemeStore((s) => s.selection);
	const { data: notebooks = [] } = useNotebooks();
	const { data: memo } = useMemoQuery(selectedMemoId ?? '');
	const { data: themes = [] } = useThemes();

	// 'ALL'/'INBOX' 以外のフィルターはノートブックID = ナビゲーション間で維持されるコンテキスト
	const filterNotebookId =
		notebookFilter !== 'ALL' && notebookFilter !== 'INBOX' ? notebookFilter : null;

	const activeNotebookId = selectedNotebookId || filterNotebookId;
	const selectedNotebook = notebooks.find((nb) => nb.id === activeNotebookId);

	// ① 文脈テーマ（ノートブック/メモ）。既存の優先順位を温存。
	const notebookContextTheme = selectedNotebook?.theme || memo?.notebook?.theme || null;
	if (notebookContextTheme) return notebookContextTheme;

	// ② シェル床（localStorage 永続）。文脈が無いときの「開いた瞬間に森」（2.1）。
	if (shellSelection) {
		const cached = themes.find((t) => t.id === shellSelection.id);
		if (cached) return cached;
		// キャッシュ未充足: slug 由来の最小 ActiveTheme（id/slug→effectKey）で解決を途切れさせない（1.5）
		return {
			id: shellSelection.id,
			name: '',
			styles: undefined,
			cssFilePath: '',
			metadata: { effectKey: shellSelection.slug },
		};
	}

	// ③ どちらも無ければ null（中立既定＝現状の白シェル / 7.1）
	return null;
}

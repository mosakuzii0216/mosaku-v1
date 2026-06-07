import { useMemoDataStore } from '../stores/useMemoDataStore';
import { useViewStore } from '../stores/useViewStore';
import { useNotebooks } from './useNotebookQueries';
import { useMemo as useMemoQuery } from './useMemoQueries';
import type { Theme } from '../types/theme';

export type ActiveTheme = Pick<Theme, 'id' | 'name' | 'styles' | 'cssFilePath' | 'metadata'>;

export function useActiveTheme(): ActiveTheme | null {
	const selectedMemoId = useMemoDataStore((s) => s.selectedMemoId);
	const selectedNotebookId = useMemoDataStore((s) => s.selectedNotebookId);
	const notebookFilter = useViewStore((s) => s.notebookFilter);
	const { data: notebooks = [] } = useNotebooks();
	const { data: memo } = useMemoQuery(selectedMemoId ?? '');

	// 'ALL'/'INBOX' 以外のフィルターはノートブックID = ナビゲーション間で維持されるコンテキスト
	const filterNotebookId =
		notebookFilter !== 'ALL' && notebookFilter !== 'INBOX' ? notebookFilter : null;

	const activeNotebookId = selectedNotebookId || filterNotebookId;
	const selectedNotebook = notebooks.find((nb) => nb.id === activeNotebookId);
	return selectedNotebook?.theme || memo?.notebook?.theme || null;
}

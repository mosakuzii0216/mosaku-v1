import { useMemoDataStore } from '../stores/useMemoDataStore';
import { useNotebooks } from './useNotebookQueries';
import { useMemo as useMemoQuery } from './useMemoQueries';
import type { Theme } from '../types/theme';

export type ActiveTheme = Pick<Theme, 'id' | 'name' | 'styles' | 'cssFilePath' | 'metadata'>;

export function useActiveTheme(): ActiveTheme | null {
	const selectedMemoId = useMemoDataStore((s) => s.selectedMemoId);
	const selectedNotebookId = useMemoDataStore((s) => s.selectedNotebookId);
	const { data: notebooks = [] } = useNotebooks();
	const { data: memo } = useMemoQuery(selectedMemoId ?? '');

	const selectedNotebook = notebooks.find((nb) => nb.id === selectedNotebookId);
	return selectedNotebook?.theme || memo?.notebook?.theme || null;
}

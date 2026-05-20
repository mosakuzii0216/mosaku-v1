import { useViewStore } from '../stores/useViewStore';
import { useMemoDataStore } from '../stores/useMemoDataStore';
import type { Memo } from '../types/memo';

interface NavigationActions {
	goToEdit: (memo: Memo) => void;
	goToMemoList: () => void;
	goToMemoCreate: () => void;
	goToNotebookCreate: () => void;
	goToNotebookEdit: (id: string) => void;
	goToNotebookList: () => void;
	goToMemosForNotebook: (filter: 'ALL' | 'INBOX' | string) => void;
	goToTags: () => void;
	goToTrash: () => void;
}

export const useNavigation = (): NavigationActions => {
	const viewStore = useViewStore();
	const { setSelectedMemoId, setSelectedNotebookId } = useMemoDataStore();

	return {
		goToEdit: (memo: Memo) => {
			viewStore.setCurrentObject('memo');
			viewStore.setCurrentView('edit');
			viewStore.setIsEditing(true);
			setSelectedMemoId(memo.id);
		},

		goToMemoList: () => {
			viewStore.goToMemoList();
			setSelectedMemoId(null);
		},

		goToMemoCreate: () => {
			viewStore.goToMemoCreate();
			setSelectedMemoId(null);
		},

		goToNotebookCreate: () => {
			viewStore.goToNotebookCreate();
			setSelectedMemoId(null);
			setSelectedNotebookId(null);
		},

		goToNotebookEdit: (id: string) => {
			viewStore.setCurrentObject('notebook');
			viewStore.setCurrentView('edit');
			viewStore.setIsEditing(true);
			setSelectedMemoId(null);
			setSelectedNotebookId(id);
		},

		goToNotebookList: () => {
			viewStore.goToNotebookList();
			setSelectedMemoId(null);
			setSelectedNotebookId(null);
		},

		goToMemosForNotebook: (filter: 'ALL' | 'INBOX' | string) => {
			viewStore.goToMemosForNotebook(filter);
			setSelectedMemoId(null);
		},

		goToTags: () => {
			viewStore.goToTags();
			setSelectedMemoId(null);
		},

		goToTrash: () => {
			viewStore.goToTrash();
			setSelectedMemoId(null);
		},
	};
};

import { create } from 'zustand';

interface MemoDataState {
	// UI状態（IDのみ保持、データはReact Queryが管理）
	selectedMemoId: string | null;
	selectedNotebookId: string | null;

	// Actions
	setSelectedMemoId: (id: string | null) => void;
	setSelectedNotebookId: (id: string | null) => void;
}

export const useMemoDataStore = create<MemoDataState>((set) => ({
	// 初期状態
	selectedMemoId: null,
	selectedNotebookId: null,

	// Actions
	setSelectedMemoId: (id) => set({ selectedMemoId: id }),
	setSelectedNotebookId: (id) => set({ selectedNotebookId: id }),
}));

import { create } from 'zustand';
import type { Memo } from '../types/memo';

interface MemoDataState {
	// データ
	memos: Memo[];
	selectedMemo: Memo | null;
	selectedNotebookId: string | null;

	// Actions
	setMemos: (memos: Memo[]) => void;
	selectMemo: (memo: Memo | null) => void;
	setSelectedNotebookId: (id: string | null) => void;

	// CRUD operations
	addMemo: (memo: Memo) => void;
	updateMemo: (memo: Memo) => void;
	deleteMemo: (id: string) => void;
}

export const useMemoDataStore = create<MemoDataState>((set) => ({
	// 初期状態
	memos: [],
	selectedMemo: null,
	selectedNotebookId: null,

	// Actions
	setMemos: (memos) => set({ memos }),
	selectMemo: (memo) => set({ selectedMemo: memo }),
	setSelectedNotebookId: (id) => set({ selectedNotebookId: id }),

	// CRUD operations
	addMemo: (memo) =>
		set((state) => ({
			memos: [memo, ...state.memos],
		})),

	updateMemo: (updatedMemo) =>
		set((state) => ({
			memos: state.memos.map((memo) => (memo.id === updatedMemo.id ? updatedMemo : memo)),
			selectedMemo: state.selectedMemo?.id === updatedMemo.id ? updatedMemo : state.selectedMemo,
		})),

	deleteMemo: (id) =>
		set((state) => ({
			memos: state.memos.filter((memo) => memo.id !== id),
			selectedMemo: state.selectedMemo?.id === id ? null : state.selectedMemo,
		})),
}));

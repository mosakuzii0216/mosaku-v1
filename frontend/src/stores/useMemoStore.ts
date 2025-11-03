import { create } from 'zustand';
import type { Memo, ViewType, ObjectType } from '../types/memo';

interface MemoStore {
	// データ
	memos: Memo[];
	selectedMemo: Memo | null;

	// UI状態
	isMobile: boolean;
	currentObject: ObjectType;
	currentView: ViewType;
	isEditing: boolean;
	searchQuery: string;
	isLoading: boolean;

	// Actions
	setMemos: (memos: Memo[]) => void;
	selectMemo: (memo: Memo | null) => void;
	setIsMobile: (isMobile: boolean) => void;
	setCurrentObject: (object: ObjectType) => void;
	setCurrentView: (view: ViewType) => void;
	setIsEditing: (isEditing: boolean) => void;
	setSearchQuery: (query: string) => void;
	setIsLoading: (isLoading: boolean) => void;

	// CRUD operations
	addMemo: (memo: Memo) => void;
	updateMemo: (memo: Memo) => void;
	deleteMemo: (id: string) => void;

	// Navigation helpers
	goToList: () => void;
	goToEdit: (memo: Memo) => void;
	goToMemoCreate: () => void;
	goToNotebookCreate: () => void;
	goToNotebookList: () => void;
	goToTags: () => void;
	logCurrent: () => void;
}

export const useMemoStore = create<MemoStore>((set, get) => ({
	// 初期状態
	memos: [],
	selectedMemo: null,
	isMobile: false,
	currentObject: 'memo',
	currentView: 'list',
	isEditing: false,
	searchQuery: '',
	isLoading: false,

	// Actions
	setMemos: (memos) => set({ memos }),
	selectMemo: (memo) => set({ selectedMemo: memo }),
	setIsMobile: (isMobile) => set({ isMobile }),
	setCurrentObject: (object) => set({ currentObject: object }),
	setCurrentView: (view) => set({ currentView: view }),
	setIsEditing: (isEditing) => set({ isEditing }),
	setSearchQuery: (query) => set({ searchQuery: query }),
	setIsLoading: (isLoading) => set({ isLoading }),

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

	// Navigation helpers
	goToList: () =>
		set({
			currentObject: 'memo',
			currentView: 'list',
			selectedMemo: null,
			isEditing: false,
		}),

	logCurrent: () => {
		const current = get();
		console.log('Current Memo Store State:', current);
	},

	goToEdit: (memo) =>
		set({
			currentObject: 'memo',
			currentView: 'edit',
			selectedMemo: memo,
			isEditing: true,
		}),

	goToMemoCreate: () =>
		set({
			currentObject: 'memo',
			currentView: 'create',
			selectedMemo: null,
			isEditing: true,
		}),

	goToNotebookCreate: () =>
		set({
			currentObject: 'notebook',
			currentView: 'create',
			selectedMemo: null,
			isEditing: true,
		}),

	goToNotebookList: () =>
		set({
			currentObject: 'notebook',
			currentView: 'list',
			selectedMemo: null,
			isEditing: false,
		}),

	goToTags: () =>
		set({
			currentObject: 'tag',
			currentView: 'list',
			selectedMemo: null,
			isEditing: false,
		}),
}));

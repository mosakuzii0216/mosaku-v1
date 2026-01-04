import { create } from 'zustand';
import type { Memo, ViewType, ObjectType } from '../types/memo';
import { logger } from '../utils/logger';

type PaletteMode = 'notebook-select' | 'memo-select';

interface MemoStore {
	// データ
	memos: Memo[];
	selectedMemo: Memo | null;
	selectedNotebookId: string | null;

	// UI状態
	isMobile: boolean;
	currentObject: ObjectType;
	currentView: ViewType;
	isEditing: boolean;
	searchQuery: string;
	isLoading: boolean;

	// Notebook filter state
	notebookFilter: 'ALL' | 'INBOX' | string;

	// Palette state
	paletteOpen: boolean;
	paletteMode: PaletteMode;
	paletteNotebookFilter: string | null;

	// Actions
	setMemos: (memos: Memo[]) => void;
	selectMemo: (memo: Memo | null) => void;
	setIsMobile: (isMobile: boolean) => void;
	setCurrentObject: (object: ObjectType) => void;
	setCurrentView: (view: ViewType) => void;
	setIsEditing: (isEditing: boolean) => void;
	setSearchQuery: (query: string) => void;
	setIsLoading: (isLoading: boolean) => void;
	setNotebookFilter: (filter: 'ALL' | 'INBOX' | string) => void;

	// Palette actions
	openMemoPalette: (mode: PaletteMode, notebookFilter?: string | null) => void;
	closeMemoPalette: () => void;

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
	goToNotebookEdit: (id: string) => void;
	goToMemosForNotebook: (filter: 'ALL' | 'INBOX' | string) => void;
	goToTags: () => void;
	logCurrent: () => void;
}

export const useMemoStore = create<MemoStore>((set, get) => ({
	// 初期状態
	memos: [],
	selectedMemo: null,
	selectedNotebookId: null,
	isMobile: false,
	currentObject: 'memo',
	currentView: 'create',
	isEditing: false,
	searchQuery: '',
	isLoading: false,
	notebookFilter: 'ALL',
	paletteOpen: false,
	paletteMode: 'memo-select',
	paletteNotebookFilter: null,

	// Actions
	setMemos: (memos) => set({ memos }),
	selectMemo: (memo) => set({ selectedMemo: memo }),
	setIsMobile: (isMobile) => set({ isMobile }),
	setCurrentObject: (object) => set({ currentObject: object }),
	setCurrentView: (view) => set({ currentView: view }),
	setIsEditing: (isEditing) => set({ isEditing }),
	setSearchQuery: (query) => set({ searchQuery: query }),
	setIsLoading: (isLoading) => set({ isLoading }),
	setNotebookFilter: (filter) => set({ notebookFilter: filter }),

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
		logger.debug('Current Memo Store State:', current);
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
			selectedNotebookId: null,
			isEditing: true,
		}),

	goToNotebookList: () =>
		set({
			currentObject: 'notebook',
			currentView: 'list',
			selectedMemo: null,
			selectedNotebookId: null,
			isEditing: false,
		}),

	goToNotebookEdit: (id) =>
		set({
			currentObject: 'notebook',
			currentView: 'edit',
			selectedMemo: null,
			selectedNotebookId: id,
			isEditing: true,
		}),

	goToMemosForNotebook: (filter) =>
		set({
			currentObject: 'memo',
			currentView: 'list',
			selectedMemo: null,
			isEditing: false,
			notebookFilter: filter,
		}),

	goToTags: () =>
		set({
			currentObject: 'tag',
			currentView: 'list',
			selectedMemo: null,
			isEditing: false,
		}),

	// Palette actions
	openMemoPalette: (mode, notebookFilter = null) =>
		set({
			paletteOpen: true,
			paletteMode: mode,
			paletteNotebookFilter: notebookFilter,
		}),

	closeMemoPalette: () =>
		set({
			paletteOpen: false,
		}),
}));

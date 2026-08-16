import { create } from 'zustand';
import type { ViewType, ObjectType } from '../types/memo';
import { logger } from '../utils/logger';

interface ViewState {
	// UI状態
	isMobile: boolean;
	currentObject: ObjectType;
	currentView: ViewType;
	isEditing: boolean;
	searchQuery: string;
	isLoading: boolean;
	notebookFilter: 'ALL' | 'INBOX' | string;
	isDisplayMode: boolean;

	// Actions
	setIsMobile: (isMobile: boolean) => void;
	setCurrentObject: (object: ObjectType) => void;
	setCurrentView: (view: ViewType) => void;
	setIsEditing: (isEditing: boolean) => void;
	setSearchQuery: (query: string) => void;
	setIsLoading: (isLoading: boolean) => void;
	setNotebookFilter: (filter: 'ALL' | 'INBOX' | string) => void;
	openDisplayMode: () => void;
	closeDisplayMode: () => void;

	// Navigation helpers
	goToHome: () => void;
	goToMemoList: () => void;
	goToMemoCreate: () => void;
	goToNotebookCreate: () => void;
	goToNotebookList: () => void;
	goToMemosForNotebook: (filter: 'ALL' | 'INBOX' | string) => void;
	goToTags: () => void;
	goToTrash: () => void;
	logCurrent: () => void;
}

export const useViewStore = create<ViewState>((set, get) => ({
	// 初期状態
	isMobile: false,
	currentObject: 'home',
	currentView: 'list',
	isEditing: false,
	searchQuery: '',
	isLoading: false,
	notebookFilter: 'ALL',
	isDisplayMode: false,

	// Actions
	setIsMobile: (isMobile) => set({ isMobile }),
	setCurrentObject: (object) => set({ currentObject: object }),
	setCurrentView: (view) => set({ currentView: view }),
	setIsEditing: (isEditing) => set({ isEditing }),
	setSearchQuery: (query) => set({ searchQuery: query }),
	setIsLoading: (isLoading) => set({ isLoading }),
	setNotebookFilter: (filter) => set({ notebookFilter: filter }),
	openDisplayMode: () => set({ isDisplayMode: true }),
	closeDisplayMode: () => set({ isDisplayMode: false }),

	// Navigation helpers
	goToHome: () =>
		set({
			currentObject: 'home',
			currentView: 'list',
			isEditing: false,
		}),

	goToMemoList: () =>
		set({
			currentObject: 'memo',
			currentView: 'list',
			isEditing: false,
		}),

	goToMemoCreate: () =>
		set({
			currentObject: 'memo',
			currentView: 'create',
			isEditing: true,
		}),

	goToNotebookCreate: () =>
		set({
			currentObject: 'notebook',
			currentView: 'create',
			isEditing: true,
		}),

	goToNotebookList: () =>
		set({
			currentObject: 'notebook',
			currentView: 'list',
			isEditing: false,
		}),

	goToMemosForNotebook: (filter) =>
		set({
			currentObject: 'memo',
			currentView: 'list',
			isEditing: false,
			notebookFilter: filter,
		}),

	goToTags: () =>
		set({
			currentObject: 'tag',
			currentView: 'list',
			isEditing: false,
		}),

	goToTrash: () =>
		set({
			currentObject: 'memo',
			currentView: 'trash',
			isEditing: false,
		}),

	logCurrent: () => {
		const current = get();
		logger.debug('Current View Store State:', current);
	},
}));

/**
 * useMemoStore - 後方互換性のための統合ストア
 *
 * このファイルは後方互換性のために維持されています。
 * 新しいコードでは、個別のストアを直接使用することを推奨します：
 * - useViewStore: UI状態とナビゲーション
 * - useMemoDataStore: 選択中メモ・ノートブックIDのUI状態
 * - usePaletteStore: パレット状態
 */
import { useViewStore } from './useViewStore';
import { useMemoDataStore } from './useMemoDataStore';
import { usePaletteStore, type PaletteMode } from './usePaletteStore';
import type { Memo, ViewType, ObjectType } from '../types/memo';

// 個別ストアを再エクスポート
export { useViewStore } from './useViewStore';
export { useMemoDataStore } from './useMemoDataStore';
export { usePaletteStore, type PaletteMode } from './usePaletteStore';

// 後方互換性のための統合インターフェース
interface MemoStore {
	// UI状態 (from useMemoDataStore)
	selectedMemoId: string | null;
	selectedNotebookId: string | null;

	// UI状態 (from useViewStore)
	isMobile: boolean;
	currentObject: ObjectType;
	currentView: ViewType;
	isEditing: boolean;
	searchQuery: string;
	isLoading: boolean;
	notebookFilter: 'ALL' | 'INBOX' | string;

	// Palette state (from usePaletteStore)
	paletteOpen: boolean;
	paletteMode: PaletteMode;
	paletteNotebookFilter: string | null;

	// UI Actions
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

	// Navigation helpers
	goToList: () => void;
	goToEdit: (memo: Memo) => void;
	goToMemoCreate: () => void;
	goToNotebookCreate: () => void;
	goToNotebookList: () => void;
	goToNotebookEdit: (id: string) => void;
	goToMemosForNotebook: (filter: 'ALL' | 'INBOX' | string) => void;
	goToTags: () => void;
	goToTrash: () => void;
	logCurrent: () => void;
}

/**
 * 後方互換性のための統合フック
 * 内部で3つの分割されたストアを使用します
 */
export const useMemoStore = (): MemoStore => {
	const viewStore = useViewStore();
	const dataStore = useMemoDataStore();
	const paletteStore = usePaletteStore();

	return {
		// UI状態 (from useMemoDataStore)
		selectedMemoId: dataStore.selectedMemoId,
		selectedNotebookId: dataStore.selectedNotebookId,

		// UI状態 (from useViewStore)
		isMobile: viewStore.isMobile,
		currentObject: viewStore.currentObject,
		currentView: viewStore.currentView,
		isEditing: viewStore.isEditing,
		searchQuery: viewStore.searchQuery,
		isLoading: viewStore.isLoading,
		notebookFilter: viewStore.notebookFilter,

		// Palette state (from usePaletteStore)
		paletteOpen: paletteStore.paletteOpen,
		paletteMode: paletteStore.paletteMode,
		paletteNotebookFilter: paletteStore.paletteNotebookFilter,

		// UI Actions
		setIsMobile: viewStore.setIsMobile,
		setCurrentObject: viewStore.setCurrentObject,
		setCurrentView: viewStore.setCurrentView,
		setIsEditing: viewStore.setIsEditing,
		setSearchQuery: viewStore.setSearchQuery,
		setIsLoading: viewStore.setIsLoading,
		setNotebookFilter: viewStore.setNotebookFilter,

		// Palette actions
		openMemoPalette: paletteStore.openMemoPalette,
		closeMemoPalette: paletteStore.closeMemoPalette,

		// Navigation helpers
		goToList: () => {
			viewStore.goToList();
			dataStore.setSelectedMemoId(null);
		},

		goToEdit: (memo: Memo) => {
			viewStore.setCurrentObject('memo');
			viewStore.setCurrentView('edit');
			viewStore.setIsEditing(true);
			dataStore.setSelectedMemoId(memo.id);
		},

		goToMemoCreate: () => {
			viewStore.goToMemoCreate();
			dataStore.setSelectedMemoId(null);
		},

		goToNotebookCreate: () => {
			viewStore.goToNotebookCreate();
			dataStore.setSelectedMemoId(null);
			dataStore.setSelectedNotebookId(null);
		},

		goToNotebookList: () => {
			viewStore.goToNotebookList();
			dataStore.setSelectedMemoId(null);
			dataStore.setSelectedNotebookId(null);
		},

		goToNotebookEdit: (id: string) => {
			viewStore.setCurrentObject('notebook');
			viewStore.setCurrentView('edit');
			viewStore.setIsEditing(true);
			dataStore.setSelectedMemoId(null);
			dataStore.setSelectedNotebookId(id);
		},

		goToMemosForNotebook: (filter: 'ALL' | 'INBOX' | string) => {
			viewStore.goToMemosForNotebook(filter);
			dataStore.setSelectedMemoId(null);
		},

		goToTags: () => {
			viewStore.goToTags();
			dataStore.setSelectedMemoId(null);
		},

		goToTrash: () => {
			viewStore.goToTrash();
			dataStore.setSelectedMemoId(null);
		},

		logCurrent: viewStore.logCurrent,
	};
};

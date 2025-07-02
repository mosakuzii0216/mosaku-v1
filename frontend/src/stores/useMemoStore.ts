import { create } from 'zustand';
import type { Memo, ViewType } from '../types/memo';

interface MemoStore {
  // データ
  memos: Memo[];
  selectedMemo: Memo | null;
  
  // UI状態
  isMobile: boolean;
  currentView: ViewType;
  isEditing: boolean;
  searchQuery: string;
  isLoading: boolean;
  
  // Actions
  setMemos: (memos: Memo[]) => void;
  selectMemo: (memo: Memo | null) => void;
  setIsMobile: (isMobile: boolean) => void;
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
  goToDetail: (memo: Memo) => void;
  goToEdit: (memo: Memo) => void;
  goToCreate: () => void;
}

export const useMemoStore = create<MemoStore>((set, get) => ({
  // 初期状態
  memos: [],
  selectedMemo: null,
  isMobile: false,
  currentView: 'list',
  isEditing: false,
  searchQuery: '',
  isLoading: false,
  
  // Actions
  setMemos: (memos) => set({ memos }),
  selectMemo: (memo) => set({ selectedMemo: memo }),
  setIsMobile: (isMobile) => set({ isMobile }),
  setCurrentView: (view) => set({ currentView: view }),
  setIsEditing: (isEditing) => set({ isEditing }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsLoading: (isLoading) => set({ isLoading }),
  
  // CRUD operations
  addMemo: (memo) => set((state) => ({ 
    memos: [memo, ...state.memos] 
  })),
  
  updateMemo: (updatedMemo) => set((state) => ({
    memos: state.memos.map(memo => 
      memo.id === updatedMemo.id ? updatedMemo : memo
    ),
    selectedMemo: state.selectedMemo?.id === updatedMemo.id 
      ? updatedMemo 
      : state.selectedMemo
  })),
  
  deleteMemo: (id) => set((state) => ({
    memos: state.memos.filter(memo => memo.id !== id),
    selectedMemo: state.selectedMemo?.id === id ? null : state.selectedMemo
  })),
  
  // Navigation helpers
  goToList: () => set({ 
    currentView: 'list', 
    selectedMemo: null, 
    isEditing: false 
  }),
  
  goToDetail: (memo) => set({ 
    currentView: 'detail', 
    selectedMemo: memo, 
    isEditing: false 
  }),
  
  goToEdit: (memo) => set({ 
    currentView: 'edit', 
    selectedMemo: memo, 
    isEditing: true 
  }),
  
  goToCreate: () => set({ 
    currentView: 'create', 
    selectedMemo: null, 
    isEditing: true 
  }),
}));

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNavigation } from './useNavigation';
import { useViewStore } from '../stores/useViewStore';
import { useMemoDataStore } from '../stores/useMemoDataStore';
import type { Memo } from '../types/memo';

const mockMemo: Memo = {
	id: 'memo-1',
	title: 'テストメモ',
	content: '<p>内容</p>',
	createdAt: '2026-04-04T00:00:00.000Z',
	updatedAt: '2026-04-04T00:00:00.000Z',
	trashedAt: null,
};

describe('useNavigation', () => {
	beforeEach(() => {
		useViewStore.setState({
			isMobile: false,
			currentObject: 'memo',
			currentView: 'list',
			isEditing: false,
			searchQuery: '',
			isLoading: false,
			notebookFilter: 'ALL',
		});
		useMemoDataStore.setState({
			selectedMemoId: 'old-id',
			selectedNotebookId: 'old-notebook-id',
		});
	});

	describe('goToEdit', () => {
		it('currentObject が memo に、currentView が edit に、isEditing が true になること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToEdit(mockMemo);
			});

			const viewState = useViewStore.getState();
			expect(viewState.currentObject).toBe('memo');
			expect(viewState.currentView).toBe('edit');
			expect(viewState.isEditing).toBe(true);
		});

		it('selectedMemoId がメモの id に更新されること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToEdit(mockMemo);
			});

			expect(useMemoDataStore.getState().selectedMemoId).toBe('memo-1');
		});
	});

	describe('goToMemoList', () => {
		it('currentObject が memo に、currentView が list に、isEditing が false になること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToMemoList();
			});

			const viewState = useViewStore.getState();
			expect(viewState.currentObject).toBe('memo');
			expect(viewState.currentView).toBe('list');
			expect(viewState.isEditing).toBe(false);
		});

		it('selectedMemoId が null にリセットされること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToMemoList();
			});

			expect(useMemoDataStore.getState().selectedMemoId).toBeNull();
		});
	});

	describe('goToMemoCreate', () => {
		it('currentObject が memo に、currentView が create に、isEditing が true になること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToMemoCreate();
			});

			const viewState = useViewStore.getState();
			expect(viewState.currentObject).toBe('memo');
			expect(viewState.currentView).toBe('create');
			expect(viewState.isEditing).toBe(true);
		});

		it('selectedMemoId が null にリセットされること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToMemoCreate();
			});

			expect(useMemoDataStore.getState().selectedMemoId).toBeNull();
		});
	});

	describe('goToNotebookCreate', () => {
		it('currentObject が notebook に、currentView が create に、isEditing が true になること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToNotebookCreate();
			});

			const viewState = useViewStore.getState();
			expect(viewState.currentObject).toBe('notebook');
			expect(viewState.currentView).toBe('create');
			expect(viewState.isEditing).toBe(true);
		});

		it('selectedMemoId と selectedNotebookId が null にリセットされること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToNotebookCreate();
			});

			const dataState = useMemoDataStore.getState();
			expect(dataState.selectedMemoId).toBeNull();
			expect(dataState.selectedNotebookId).toBeNull();
		});
	});

	describe('goToNotebookEdit', () => {
		it('currentObject が notebook に、currentView が edit に、isEditing が true になること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToNotebookEdit('notebook-1');
			});

			const viewState = useViewStore.getState();
			expect(viewState.currentObject).toBe('notebook');
			expect(viewState.currentView).toBe('edit');
			expect(viewState.isEditing).toBe(true);
		});

		it('selectedMemoId が null に、selectedNotebookId が指定 id に更新されること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToNotebookEdit('notebook-1');
			});

			const dataState = useMemoDataStore.getState();
			expect(dataState.selectedMemoId).toBeNull();
			expect(dataState.selectedNotebookId).toBe('notebook-1');
		});
	});

	describe('goToNotebookList', () => {
		it('currentObject が notebook に、currentView が list に、isEditing が false になること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToNotebookList();
			});

			const viewState = useViewStore.getState();
			expect(viewState.currentObject).toBe('notebook');
			expect(viewState.currentView).toBe('list');
			expect(viewState.isEditing).toBe(false);
		});

		it('selectedMemoId と selectedNotebookId が null にリセットされること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToNotebookList();
			});

			const dataState = useMemoDataStore.getState();
			expect(dataState.selectedMemoId).toBeNull();
			expect(dataState.selectedNotebookId).toBeNull();
		});
	});

	describe('goToMemosForNotebook', () => {
		it('currentObject が memo に、currentView が list に、notebookFilter が指定値に更新されること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToMemosForNotebook('notebook-1');
			});

			const viewState = useViewStore.getState();
			expect(viewState.currentObject).toBe('memo');
			expect(viewState.currentView).toBe('list');
			expect(viewState.isEditing).toBe(false);
			expect(viewState.notebookFilter).toBe('notebook-1');
		});

		it('selectedMemoId が null にリセットされること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToMemosForNotebook('ALL');
			});

			expect(useMemoDataStore.getState().selectedMemoId).toBeNull();
		});

		it('filter に ALL を渡した場合も正しく動作すること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToMemosForNotebook('ALL');
			});

			expect(useViewStore.getState().notebookFilter).toBe('ALL');
		});

		it('filter に INBOX を渡した場合も正しく動作すること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToMemosForNotebook('INBOX');
			});

			expect(useViewStore.getState().notebookFilter).toBe('INBOX');
		});
	});

	describe('goToTags', () => {
		it('currentObject が tag に、currentView が list に、isEditing が false になること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToTags();
			});

			const viewState = useViewStore.getState();
			expect(viewState.currentObject).toBe('tag');
			expect(viewState.currentView).toBe('list');
			expect(viewState.isEditing).toBe(false);
		});

		it('selectedMemoId が null にリセットされること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToTags();
			});

			expect(useMemoDataStore.getState().selectedMemoId).toBeNull();
		});
	});

	describe('goToTrash', () => {
		it('currentObject が memo に、currentView が trash に、isEditing が false になること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToTrash();
			});

			const viewState = useViewStore.getState();
			expect(viewState.currentObject).toBe('memo');
			expect(viewState.currentView).toBe('trash');
			expect(viewState.isEditing).toBe(false);
		});

		it('selectedMemoId が null にリセットされること', () => {
			const { result } = renderHook(() => useNavigation());

			act(() => {
				result.current.goToTrash();
			});

			expect(useMemoDataStore.getState().selectedMemoId).toBeNull();
		});
	});
});

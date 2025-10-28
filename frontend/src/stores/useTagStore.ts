import { create } from 'zustand';
import type { Tag } from '../types/tag';

interface TagStore {
	// データ
	tags: Tag[];
	selectedTags: string[];

	// UI状態
	isLoading: boolean;
	searchQuery: string;

	// Actions
	setTags: (tags: Tag[]) => void;
	setSelectedTags: (tagIds: string[]) => void;
	setIsLoading: (isLoading: boolean) => void;
	setSearchQuery: (query: string) => void;

	// CRUD operations
	addTag: (tag: Tag) => void;
	updateTag: (tag: Tag) => void;
	deleteTag: (id: string) => void;

	// Selection helpers
	toggleTag: (tagId: string) => void;
	clearSelectedTags: () => void;
	isTagSelected: (tagId: string) => boolean;

	// Getters
	getFilteredTags: () => Tag[];
	getSelectedTagsData: () => Tag[];
}

export const useTagStore = create<TagStore>((set, get) => ({
	// 初期状態
	tags: [],
	selectedTags: [],
	isLoading: false,
	searchQuery: '',

	// Actions
	setTags: (tags) => set({ tags }),
	setSelectedTags: (tagIds) => set({ selectedTags: tagIds }),
	setIsLoading: (isLoading) => set({ isLoading }),
	setSearchQuery: (query) => set({ searchQuery: query }),

	// CRUD operations
	addTag: (tag) =>
		set((state) => ({
			tags: [...state.tags, tag].sort((a, b) => a.name.localeCompare(b.name)),
		})),

	updateTag: (updatedTag) =>
		set((state) => ({
			tags: state.tags
				.map((tag) => (tag.id === updatedTag.id ? updatedTag : tag))
				.sort((a, b) => a.name.localeCompare(b.name)),
		})),

	deleteTag: (id) =>
		set((state) => ({
			tags: state.tags.filter((tag) => tag.id !== id),
			selectedTags: state.selectedTags.filter((tagId) => tagId !== id),
		})),

	// Selection helpers
	toggleTag: (tagId) =>
		set((state) => ({
			selectedTags: state.selectedTags.includes(tagId)
				? state.selectedTags.filter((id) => id !== tagId)
				: [...state.selectedTags, tagId],
		})),

	clearSelectedTags: () => set({ selectedTags: [] }),

	isTagSelected: (tagId) => {
		const state = get();
		return state.selectedTags.includes(tagId);
	},

	// Getters
	getFilteredTags: () => {
		const state = get();
		if (!state.searchQuery) return state.tags;

		return state.tags.filter((tag) =>
			tag.name.toLowerCase().includes(state.searchQuery.toLowerCase()),
		);
	},

	getSelectedTagsData: () => {
		const state = get();
		return state.tags.filter((tag) => state.selectedTags.includes(tag.id));
	},
}));

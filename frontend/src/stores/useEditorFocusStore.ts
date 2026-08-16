import { create } from 'zustand';

interface EditorFocusState {
	isEditorFocused: boolean;
	setEditorFocused: (next: boolean) => void;
}

export const useEditorFocusStore = create<EditorFocusState>((set) => ({
	isEditorFocused: false,
	setEditorFocused: (next) => set({ isEditorFocused: next }),
}));

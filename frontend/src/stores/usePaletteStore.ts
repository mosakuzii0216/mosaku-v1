import { create } from 'zustand';

export type PaletteMode = 'notebook-select' | 'memo-select';

interface PaletteState {
	// Palette状態
	paletteOpen: boolean;
	paletteMode: PaletteMode;
	paletteNotebookFilter: string | null;

	// Actions
	openMemoPalette: (mode: PaletteMode, notebookFilter?: string | null) => void;
	closeMemoPalette: () => void;
}

export const usePaletteStore = create<PaletteState>((set) => ({
	// 初期状態
	paletteOpen: false,
	paletteMode: 'memo-select',
	paletteNotebookFilter: null,

	// Actions
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

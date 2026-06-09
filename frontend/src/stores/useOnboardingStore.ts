import { create } from 'zustand';

interface OnboardingStore {
	isOpen: boolean;
	selectedThemeId: string | null;
	open(): void;
	close(): void;
	setSelectedThemeId(themeId: string | null): void;
}

export const useOnboardingStore = create<OnboardingStore>((set) => ({
	isOpen: false,
	selectedThemeId: null,
	open: () => set({ isOpen: true }),
	close: () => set({ isOpen: false, selectedThemeId: null }),
	setSelectedThemeId: (themeId) => set({ selectedThemeId: themeId }),
}));

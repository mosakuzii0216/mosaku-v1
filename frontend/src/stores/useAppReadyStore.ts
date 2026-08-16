import { create } from 'zustand';

export type AppReadyStatus = 'booting' | 'ready' | 'error';

export interface AppReadyState {
	status: AppReadyStatus;
	error: Error | null;
	pendingCountOnBoot: number;
	setReady: (pendingCountOnBoot: number) => void;
	setError: (error: Error) => void;
	resetForTest: () => void;
}

export const useAppReadyStore = create<AppReadyState>((set) => ({
	status: 'booting',
	error: null,
	pendingCountOnBoot: 0,
	setReady: (pendingCountOnBoot) => set({ status: 'ready', error: null, pendingCountOnBoot }),
	setError: (error) => set({ status: 'error', error }),
	resetForTest: () => set({ status: 'booting', error: null, pendingCountOnBoot: 0 }),
}));

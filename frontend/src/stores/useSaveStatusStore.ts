import { create } from 'zustand';
import type { SaveStatus } from '../hooks/useAutoSave';

interface SaveStatusState {
	statuses: Readonly<Record<string, SaveStatus>>;
	setStatus: (instanceId: string, status: SaveStatus) => void;
	clearStatus: (instanceId: string) => void;
}

/** 自動リロードを保留すべき status（未保存・進行中・失敗） */
export const RELOAD_BLOCKING_STATUSES: ReadonlySet<SaveStatus> = new Set<SaveStatus>([
	'pending',
	'saving',
	'error',
]);

/** いずれかのエディタに未保存/進行中/失敗があるとき true */
export function selectHasUnsavedWork(state: SaveStatusState): boolean {
	return Object.values(state.statuses).some((s) => RELOAD_BLOCKING_STATUSES.has(s));
}

export const useSaveStatusStore = create<SaveStatusState>((set) => ({
	statuses: {},
	setStatus: (instanceId, status) =>
		set((state) => ({ statuses: { ...state.statuses, [instanceId]: status } })),
	clearStatus: (instanceId) =>
		set((state) => {
			const { [instanceId]: _removed, ...rest } = state.statuses;
			return { statuses: rest };
		}),
}));

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
	useNetworkStatusStore,
	subscribeWindowNetworkEvents,
	resetNetworkStatusForTest,
} from './useNetworkStatusStore';

describe('useNetworkStatusStore', () => {
	beforeEach(() => {
		resetNetworkStatusForTest();
	});

	it('初期状態は unstable で lastChangeAt が ISO8601 文字列', () => {
		const { status, lastChangeAt } = useNetworkStatusStore.getState();
		expect(status).toBe('unstable');
		expect(typeof lastChangeAt).toBe('string');
		expect(Number.isNaN(Date.parse(lastChangeAt))).toBe(false);
	});

	it('setStatus で status / lastChangeAt が更新される', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-10T00:00:00.000Z'));

		const initial = useNetworkStatusStore.getState().lastChangeAt;
		vi.setSystemTime(new Date('2026-05-10T00:01:00.000Z'));
		useNetworkStatusStore.getState().setStatus('online');

		const next = useNetworkStatusStore.getState();
		expect(next.status).toBe('online');
		expect(next.lastChangeAt).not.toBe(initial);
		expect(next.lastChangeAt).toBe('2026-05-10T00:01:00.000Z');

		vi.useRealTimers();
	});

	it('同じ status を再 set しても lastChangeAt は変わらない', () => {
		useNetworkStatusStore.getState().setStatus('online');
		const firstChange = useNetworkStatusStore.getState().lastChangeAt;

		// 時刻を進めるが status は同じ
		const sameStatus = useNetworkStatusStore.getState().status;
		useNetworkStatusStore.getState().setStatus(sameStatus);

		expect(useNetworkStatusStore.getState().lastChangeAt).toBe(firstChange);
	});

	it('subscribers に同期的に通知される', () => {
		const calls: Array<'online' | 'unstable' | 'offline'> = [];
		const unsubscribe = useNetworkStatusStore.subscribe((state) => {
			calls.push(state.status);
		});

		useNetworkStatusStore.getState().setStatus('online');
		useNetworkStatusStore.getState().setStatus('offline');

		expect(calls).toEqual(['online', 'offline']);
		unsubscribe();
	});
});

describe('subscribeWindowNetworkEvents', () => {
	let onlineHandler: EventListener | null = null;
	let offlineHandler: EventListener | null = null;
	let removedListeners: string[] = [];

	beforeEach(() => {
		resetNetworkStatusForTest();
		onlineHandler = null;
		offlineHandler = null;
		removedListeners = [];
		vi.spyOn(window, 'addEventListener').mockImplementation(((
			type: string,
			handler: EventListenerOrEventListenerObject,
		) => {
			if (type === 'online') onlineHandler = handler as EventListener;
			if (type === 'offline') offlineHandler = handler as EventListener;
		}) as typeof window.addEventListener);
		vi.spyOn(window, 'removeEventListener').mockImplementation(((type: string) => {
			removedListeners.push(type);
		}) as typeof window.removeEventListener);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('online イベントで status が online に変化する', () => {
		subscribeWindowNetworkEvents();
		expect(onlineHandler).not.toBeNull();
		onlineHandler?.(new Event('online'));
		expect(useNetworkStatusStore.getState().status).toBe('online');
	});

	it('offline イベントで status が offline に変化する', () => {
		subscribeWindowNetworkEvents();
		offlineHandler?.(new Event('offline'));
		expect(useNetworkStatusStore.getState().status).toBe('offline');
	});

	it('返却された unsubscribe を呼ぶと online/offline リスナーが削除される', () => {
		const unsubscribe = subscribeWindowNetworkEvents();
		unsubscribe();
		expect(removedListeners).toContain('online');
		expect(removedListeners).toContain('offline');
	});
});

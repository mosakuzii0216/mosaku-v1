import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

import { SyncToast } from './SyncToast';
import type { SyncEvent } from '../../utils/sync/types';

let mockedEvent: SyncEvent | null = null;
let listener: ((e: SyncEvent) => void) | null = null;

vi.mock('../../hooks/useSyncEngine', () => ({
	useSyncEngine: () => ({
		pendingCount: 0,
		lastSyncAt: null,
		lastEvent: mockedEvent,
		isRunning: true,
		isLeader: true,
		triggerDrainNow: vi.fn(),
	}),
}));

vi.mock('../../utils/sync/instance', () => ({
	getSyncEngine: () => ({
		subscribe: (fn: (e: SyncEvent) => void) => {
			listener = fn;
			return () => {
				listener = null;
			};
		},
	}),
}));

const dispatch = (event: SyncEvent) => {
	mockedEvent = event;
	if (listener) listener(event);
};

describe('SyncToast', () => {
	beforeEach(() => {
		mockedEvent = null;
		listener = null;
		vi.useFakeTimers();
	});
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it('cycle-complete の succeeded > 0 で成功トーストを表示する', async () => {
		render(<SyncToast />);
		await act(async () => {
			dispatch({
				type: 'cycle-complete',
				result: {
					kind: 'completed',
					succeeded: 3,
					skippedByLww: [],
					removedOnServer: [],
					failed: 0,
				},
			});
		});
		const toast = screen.getByTestId('sync-toast-success');
		expect(toast.textContent).toContain('3');
		expect(toast.textContent).toContain('同期');
	});

	it('skippedByLww がある場合は対象タイトルを列挙したスキップトーストを表示する', async () => {
		render(<SyncToast />);
		await act(async () => {
			dispatch({
				type: 'cycle-complete',
				result: {
					kind: 'completed',
					succeeded: 0,
					skippedByLww: [
						{ memoId: 'a', title: '会議メモ' },
						{ memoId: 'b', title: '買い物リスト' },
					],
					removedOnServer: [],
					failed: 0,
				},
			});
		});
		const toast = screen.getByTestId('sync-toast-skipped');
		expect(toast.textContent).toContain('会議メモ');
		expect(toast.textContent).toContain('買い物リスト');
	});

	it('removedOnServer がある場合は 404 削除済み通知を表示する', async () => {
		render(<SyncToast />);
		await act(async () => {
			dispatch({
				type: 'cycle-complete',
				result: {
					kind: 'completed',
					succeeded: 0,
					skippedByLww: [],
					removedOnServer: [{ memoId: 'x', title: '消えたメモ' }],
					failed: 0,
				},
			});
		});
		const toast = screen.getByTestId('sync-toast-removed');
		expect(toast.textContent).toContain('消えたメモ');
		expect(toast.textContent).toMatch(/サーバー側で削除/);
	});

	it('failed > 0 のときはリトライ上限到達トーストを表示する', async () => {
		render(<SyncToast />);
		await act(async () => {
			dispatch({
				type: 'cycle-complete',
				result: {
					kind: 'completed',
					succeeded: 0,
					skippedByLww: [],
					removedOnServer: [],
					failed: 2,
				},
			});
		});
		const toast = screen.getByTestId('sync-toast-failed');
		expect(toast.textContent).toContain('2');
		expect(toast.textContent).toMatch(/再試行|失敗/);
	});

	it('auth-required イベントで再ログイン案内のトーストを表示する', async () => {
		render(<SyncToast />);
		await act(async () => {
			dispatch({ type: 'auth-required' });
		});
		const toast = screen.getByTestId('sync-toast-auth');
		expect(toast.textContent).toMatch(/再ログイン/);
	});

	it('トーストは指定時間後に自動で消える', async () => {
		render(<SyncToast autoDismissMs={1000} />);
		await act(async () => {
			dispatch({
				type: 'cycle-complete',
				result: {
					kind: 'completed',
					succeeded: 1,
					skippedByLww: [],
					removedOnServer: [],
					failed: 0,
				},
			});
		});
		expect(screen.queryByTestId('sync-toast-success')).not.toBeNull();
		await act(async () => {
			vi.advanceTimersByTime(1100);
		});
		expect(screen.queryByTestId('sync-toast-success')).toBeNull();
	});

	it('cycle-start や pending-changed では何も表示しない', async () => {
		render(<SyncToast />);
		await act(async () => {
			dispatch({ type: 'cycle-start' });
			dispatch({ type: 'pending-changed', count: 4 });
		});
		expect(screen.queryByTestId('sync-toast-success')).toBeNull();
		expect(screen.queryByTestId('sync-toast-skipped')).toBeNull();
		expect(screen.queryByTestId('sync-toast-removed')).toBeNull();
		expect(screen.queryByTestId('sync-toast-failed')).toBeNull();
		expect(screen.queryByTestId('sync-toast-auth')).toBeNull();
	});

	it('succeeded == 0 のときは成功トーストを出さない', async () => {
		render(<SyncToast />);
		await act(async () => {
			dispatch({
				type: 'cycle-complete',
				result: {
					kind: 'completed',
					succeeded: 0,
					skippedByLww: [],
					removedOnServer: [],
					failed: 0,
				},
			});
		});
		expect(screen.queryByTestId('sync-toast-success')).toBeNull();
	});
});

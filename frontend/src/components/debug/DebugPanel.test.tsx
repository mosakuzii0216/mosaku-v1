import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';

import { DebugPanel } from './DebugPanel';
import type { SyncEvent } from '../../utils/sync/types';
import type { DebugStats } from '../../utils/offline/repository';

let mockedSyncEvent: SyncEvent | null = null;
let mockedLastSyncAt: string | null = null;
let mockedPending = 0;
let listener: ((e: SyncEvent) => void) | null = null;
let mockedStats: DebugStats = { cachedCount: 0, pendingCount: 0 };
const statsForDebugSpy = vi.fn(async () => mockedStats);

vi.mock('../../hooks/useSyncEngine', () => ({
	useSyncEngine: () => ({
		pendingCount: mockedPending,
		lastSyncAt: mockedLastSyncAt,
		lastEvent: mockedSyncEvent,
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

vi.mock('../../utils/offline/instance', () => ({
	getOfflineRepository: () => ({
		repository: { statsForDebug: statsForDebugSpy },
		ready: Promise.resolve({}),
	}),
}));

describe('DebugPanel', () => {
	beforeEach(() => {
		mockedSyncEvent = null;
		mockedLastSyncAt = null;
		mockedPending = 0;
		mockedStats = { cachedCount: 0, pendingCount: 0 };
		listener = null;
		statsForDebugSpy.mockClear();
	});
	afterEach(() => {
		cleanup();
	});

	it('マウント時に statsForDebug を呼びキャッシュ件数とキュー件数を表示する', async () => {
		mockedStats = {
			cachedCount: 42,
			pendingCount: 7,
		};
		render(<DebugPanel />);

		await waitFor(() => {
			expect(statsForDebugSpy).toHaveBeenCalled();
		});
		await waitFor(() => {
			expect(screen.getByTestId('debug-cached-count').textContent).toContain('42');
		});
		expect(screen.getByTestId('debug-pending-count').textContent).toContain('7');
	});

	it('quotaSnapshot がある場合は usage / quota / threshold を表示する', async () => {
		mockedStats = {
			cachedCount: 0,
			pendingCount: 0,
			quotaSnapshot: {
				usageBytes: 1024 * 1024 * 10,
				quotaBytes: 1024 * 1024 * 50,
				maxEntries: 200,
				thresholdReached: false,
			},
		};
		render(<DebugPanel />);

		await waitFor(() => {
			expect(screen.getByTestId('debug-quota-usage')).toBeTruthy();
		});
		const usage = screen.getByTestId('debug-quota-usage');
		expect(usage.textContent).toMatch(/MB/);
	});

	it('lastSyncAt を表示する（未同期なら「未同期」相当の表示）', async () => {
		mockedLastSyncAt = null;
		render(<DebugPanel />);
		await waitFor(() => {
			expect(screen.getByTestId('debug-last-sync-at')).toBeTruthy();
		});
		expect(screen.getByTestId('debug-last-sync-at').textContent).toMatch(/未同期|なし/);

		cleanup();
		mockedLastSyncAt = '2026-05-11T12:34:56.000Z';
		render(<DebugPanel />);
		await waitFor(() => {
			expect(screen.getByTestId('debug-last-sync-at').textContent).toContain('2026');
		});
	});

	it('cycle-complete イベントで stats を再取得する', async () => {
		render(<DebugPanel />);

		await waitFor(() => {
			expect(statsForDebugSpy).toHaveBeenCalledTimes(1);
		});

		await act(async () => {
			listener?.({
				type: 'cycle-complete',
				result: {
					kind: 'completed',
					succeeded: 5,
					skippedByLww: [],
					removedOnServer: [],
					failed: 0,
				},
			});
		});

		await waitFor(() => {
			expect(statsForDebugSpy).toHaveBeenCalledTimes(2);
		});
	});

	it('最終同期結果（succeeded / skippedByLww / failed）を表示する', async () => {
		render(<DebugPanel />);

		await act(async () => {
			listener?.({
				type: 'cycle-complete',
				result: {
					kind: 'completed',
					succeeded: 3,
					skippedByLww: [{ memoId: 'a', title: 'メモ A' }],
					removedOnServer: [],
					failed: 1,
				},
			});
		});

		await waitFor(() => {
			expect(screen.getByTestId('debug-last-result')).toBeTruthy();
		});
		const text = screen.getByTestId('debug-last-result').textContent ?? '';
		expect(text).toContain('3');
		expect(text).toMatch(/スキップ|skipped/);
		expect(text).toContain('1');
	});
});

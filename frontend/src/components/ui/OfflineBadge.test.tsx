import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { OfflineBadge } from './OfflineBadge';

type NetworkStatus = 'online' | 'unstable' | 'offline';

let mockedNetwork: NetworkStatus = 'online';
let mockedPending = 0;

vi.mock('../../hooks/useNetworkStatus', () => ({
	useNetworkStatus: () => ({
		status: mockedNetwork,
		lastChangeAt: '2026-05-11T00:00:00.000Z',
		isOnline: mockedNetwork === 'online',
		isOffline: mockedNetwork === 'offline',
		isUnstable: mockedNetwork === 'unstable',
	}),
}));

vi.mock('../../hooks/useSyncEngine', () => ({
	useSyncEngine: () => ({
		pendingCount: mockedPending,
		lastSyncAt: null,
		lastEvent: null,
		isRunning: true,
		isLeader: true,
		triggerDrainNow: vi.fn(),
	}),
}));

describe('OfflineBadge', () => {
	beforeEach(() => {
		mockedNetwork = 'online';
		mockedPending = 0;
	});
	afterEach(() => {
		cleanup();
	});

	it('オンラインかつ未同期件数 0 の場合は何も表示しない', () => {
		mockedNetwork = 'online';
		mockedPending = 0;
		const { container } = render(<OfflineBadge />);
		expect(container.firstChild).toBeNull();
	});

	it('オフライン時は赤系の「オフライン」表示を出す', () => {
		mockedNetwork = 'offline';
		render(<OfflineBadge />);
		const badge = screen.getByTestId('offline-badge-status');
		expect(badge.textContent).toContain('オフライン');
		expect(badge.className).toMatch(/bg-red/);
	});

	it('通信不安定時は黄系の「通信不安定」表示を出す', () => {
		mockedNetwork = 'unstable';
		render(<OfflineBadge />);
		const badge = screen.getByTestId('offline-badge-status');
		expect(badge.textContent).toContain('通信不安定');
		expect(badge.className).toMatch(/bg-amber|bg-yellow/);
	});

	it('未同期件数が 1 以上のときは数字バッジを表示する', () => {
		mockedNetwork = 'online';
		mockedPending = 3;
		render(<OfflineBadge />);
		const pending = screen.getByTestId('offline-badge-pending');
		expect(pending.textContent).toBe('3');
	});

	it('オフラインかつ未同期 2 件のときは両方のバッジを表示する', () => {
		mockedNetwork = 'offline';
		mockedPending = 2;
		render(<OfflineBadge />);
		expect(screen.getByTestId('offline-badge-status').textContent).toContain('オフライン');
		expect(screen.getByTestId('offline-badge-pending').textContent).toBe('2');
	});

	it('aria-live により状態変化が支援技術へ告知される', () => {
		mockedNetwork = 'offline';
		render(<OfflineBadge />);
		const region = screen.getByTestId('offline-badge-region');
		expect(region.getAttribute('aria-live')).toBe('polite');
	});

	it('variant="detail" のとき未同期件数のテキストラベルを併記する', () => {
		mockedNetwork = 'online';
		mockedPending = 5;
		render(<OfflineBadge variant="detail" />);
		const pending = screen.getByTestId('offline-badge-pending');
		expect(pending.textContent).toContain('未同期 5 件');
	});
});

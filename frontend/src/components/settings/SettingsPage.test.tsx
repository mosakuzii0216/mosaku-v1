import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { SettingsPage } from './SettingsPage';

vi.mock('../../utils/api', () => ({
	apiClient: {
		getMyInvitations: vi.fn().mockResolvedValue([]),
		getMyInvitationQuota: vi
			.fn()
			.mockResolvedValue({ invitationQuota: 5, unlimited: false, role: 'USER' }),
	},
}));

vi.mock('../debug/DebugPanel', () => ({
	DebugPanel: () => React.createElement('div', { 'data-testid': 'debug-panel' }, 'debug'),
}));

function renderPage() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		React.createElement(
			QueryClientProvider,
			{ client },
			React.createElement(MemoryRouter, null, React.createElement(SettingsPage)),
		),
	);
}

describe('SettingsPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('「友達を招待」セクションに InvitationCard が描画される', () => {
		renderPage();
		expect(screen.getByText(/友達を招待/)).toBeTruthy();
		expect(screen.getByTestId('invitation-card')).toBeTruthy();
	});

	it('開発者向け DebugPanel も引き続き表示される', () => {
		renderPage();
		expect(screen.getByTestId('debug-panel')).toBeTruthy();
	});
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('./PublicMemoView', () => ({
	PublicMemoView: ({ memo }: { memo: { title: string } }) =>
		React.createElement('div', { 'data-testid': 'public-memo-view' }, memo.title),
}));

const getPublicMemo = vi.fn();

vi.mock('../../utils/api', () => ({
	apiClient: {
		getPublicMemo: (...args: unknown[]) => getPublicMemo(...args),
	},
}));

import { PublicMemoPage } from './PublicMemoPage';

function renderPage(token: string) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		React.createElement(
			QueryClientProvider,
			{ client },
			React.createElement(
				MemoryRouter,
				{ initialEntries: [`/p/${token}`] },
				React.createElement(
					Routes,
					null,
					React.createElement(Route, {
						path: '/p/:token',
						element: React.createElement(PublicMemoPage),
					}),
				),
			),
		),
	);
}

describe('PublicMemoPage', () => {
	it('ローディング中はスピナーを表示する', () => {
		getPublicMemo.mockReturnValue(new Promise(() => {}));
		renderPage('some-token');
		expect(screen.getByRole('status')).toBeTruthy();
	});

	it('データ取得成功時に PublicMemoView を描画する', async () => {
		getPublicMemo.mockResolvedValue({
			title: '公開メモ',
			content: '<p>本文</p>',
			updatedAt: '2026-05-30T10:00:00Z',
		});
		renderPage('valid-token');

		const view = await screen.findByTestId('public-memo-view');
		expect(view).toBeTruthy();
		expect(screen.getByText('公開メモ')).toBeTruthy();
	});

	it('404 エラー時に中立的なメッセージを表示する', async () => {
		getPublicMemo.mockRejectedValue(new Error('HTTP error! status: 404'));
		renderPage('invalid-token');

		const msg = await screen.findByText(/公開が解除/);
		expect(msg).toBeTruthy();
	});

	it('404 時に Mosaku トップへの導線リンクを表示する', async () => {
		getPublicMemo.mockRejectedValue(new Error('HTTP error! status: 404'));
		renderPage('invalid-token');

		const link = await screen.findByRole('link');
		expect(link).toBeTruthy();
	});
});

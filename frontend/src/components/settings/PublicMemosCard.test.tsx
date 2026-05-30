import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../utils/env', () => ({
	getBackendUrl: () => 'http://localhost:3000',
	getAppUrl: () => 'http://localhost:5173',
	getSupabaseConfig: () => ({ supabaseUrl: 'http://localhost:54321', supabaseAnonKey: 'anon' }),
	getGoogleClientId: () => '',
	getGithubClientId: () => '',
	getEnvConfig: () => ({
		backendUrl: 'http://localhost:3000',
		appUrl: 'http://localhost:5173',
		supabaseUrl: 'http://localhost:54321',
		supabaseAnonKey: 'anon',
	}),
	envValidator: { getConfig: () => ({}) },
}));

const unpublishMemoMutate = vi.fn();
const regenerateTokenMutate = vi.fn();
const myPublicMemosData = vi.fn();

vi.mock('../../hooks/useMemoSharingQueries', () => ({
	useMyPublicMemos: () => ({
		data: myPublicMemosData(),
		isLoading: false,
	}),
	useUnpublishMemo: () => ({
		mutateAsync: unpublishMemoMutate,
		isPending: false,
	}),
	useRegenerateMemoToken: () => ({
		mutateAsync: regenerateTokenMutate,
		isPending: false,
	}),
}));

import { PublicMemosCard } from './PublicMemosCard';

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

const sampleMemos = [
	{
		memoId: 'memo-1',
		title: 'テストメモ1',
		publicToken: 'token_abc_1',
		publishedAt: '2026-05-01T00:00:00Z',
		updatedAt: '2026-05-02T00:00:00Z',
	},
	{
		memoId: 'memo-2',
		title: 'テストメモ2',
		publicToken: 'token_abc_2',
		publishedAt: '2026-04-01T00:00:00Z',
		updatedAt: '2026-04-02T00:00:00Z',
	},
];

describe('PublicMemosCard - 空状態', () => {
	beforeEach(() => {
		cleanup();
		vi.clearAllMocks();
		myPublicMemosData.mockReturnValue([]);
	});

	it('「現在公開中のメモはありません」メッセージを表示する', () => {
		const Wrapper = createWrapper();
		render(<PublicMemosCard />, { wrapper: Wrapper });
		screen.getByTestId('public-memos-empty');
		screen.getByText(/現在公開中のメモはありません/);
	});

	it('メモ編集画面からの公開導線説明を表示する', () => {
		const Wrapper = createWrapper();
		render(<PublicMemosCard />, { wrapper: Wrapper });
		screen.getByText(/メモ編集画面/);
	});
});

describe('PublicMemosCard - 一覧状態', () => {
	beforeEach(() => {
		cleanup();
		vi.clearAllMocks();
		myPublicMemosData.mockReturnValue(sampleMemos);
	});

	it('公開中メモのタイトルを一覧表示する', () => {
		const Wrapper = createWrapper();
		render(<PublicMemosCard />, { wrapper: Wrapper });
		screen.getByText('テストメモ1');
		screen.getByText('テストメモ2');
	});

	it('各エントリに「URLをコピー」「再生成」「公開解除」ボタンがある', () => {
		const Wrapper = createWrapper();
		render(<PublicMemosCard />, { wrapper: Wrapper });
		const copyButtons = screen.getAllByRole('button', { name: /URLをコピー/ });
		const regenerateButtons = screen.getAllByRole('button', { name: /再生成/ });
		const unpublishButtons = screen.getAllByRole('button', { name: /公開解除/ });
		expect(copyButtons).toHaveLength(2);
		expect(regenerateButtons).toHaveLength(2);
		expect(unpublishButtons).toHaveLength(2);
	});

	it('「URLをコピー」をクリックすると正しい公開URLがクリップボードに書き込まれる', async () => {
		const writeTextMock = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', {
			...navigator,
			clipboard: { writeText: writeTextMock },
		});

		const Wrapper = createWrapper();
		render(<PublicMemosCard />, { wrapper: Wrapper });

		const copyButtons = screen.getAllByRole('button', { name: /URLをコピー/ });
		await act(async () => {
			fireEvent.click(copyButtons[0]);
		});

		expect(writeTextMock).toHaveBeenCalledWith('http://localhost:5173/p/token_abc_1');

		vi.unstubAllGlobals();
	});

	it('「公開解除」をクリックすると useUnpublishMemo が対象 memoId で呼ばれる', async () => {
		unpublishMemoMutate.mockResolvedValue({ success: true });
		const Wrapper = createWrapper();
		render(<PublicMemosCard />, { wrapper: Wrapper });

		const unpublishButtons = screen.getAllByRole('button', { name: /公開解除/ });
		await act(async () => {
			fireEvent.click(unpublishButtons[0]);
		});

		expect(unpublishMemoMutate).toHaveBeenCalledWith('memo-1');
	});

	it('「再生成」をクリックすると useRegenerateMemoToken が memoId と oldToken で呼ばれる', async () => {
		regenerateTokenMutate.mockResolvedValue({
			memoId: 'memo-1',
			publicToken: 'new_token',
			publishedAt: '2026-05-01T00:00:00Z',
		});
		const Wrapper = createWrapper();
		render(<PublicMemosCard />, { wrapper: Wrapper });

		const regenerateButtons = screen.getAllByRole('button', { name: /再生成/ });
		await act(async () => {
			fireEvent.click(regenerateButtons[0]);
		});

		expect(regenerateTokenMutate).toHaveBeenCalledWith({
			memoId: 'memo-1',
			oldToken: 'token_abc_1',
		});
	});
});

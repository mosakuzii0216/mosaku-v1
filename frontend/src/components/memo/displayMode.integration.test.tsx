import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

vi.mock('../editor/RichTextEditor', () => ({
	RichTextEditor: ({
		content,
		onChange,
	}: {
		content: string;
		onChange: (value: string) => void;
	}) => (
		<textarea
			data-testid="memo-content-textarea"
			value={content}
			onChange={(e) => onChange(e.target.value)}
		/>
	),
}));

vi.mock('../../hooks/useNotebookQueries', () => ({
	useNotebooks: () => ({ data: [], isLoading: false }),
}));

vi.mock('../../hooks/useNetworkStatus', () => ({
	useNetworkStatus: () => ({ status: 'online' }),
}));

vi.mock('../../hooks/useTagQueries', () => ({
	useTagQueries: () => ({
		assignTags: vi.fn(),
		tagsQuery: { data: [] },
	}),
}));

vi.mock('../../hooks/useMemoQueries', () => ({
	useCreateMemo: () => ({ mutate: vi.fn(), isPending: false }),
	useUpdateMemo: () => ({ mutate: vi.fn(), isPending: false }),
	useDeleteMemo: () => ({ mutateAsync: vi.fn(), isPending: false }),
	useMemo: (id: string) => ({
		data: id ? { id, title: 'テストメモタイトル', content: '<p>テスト本文</p>' } : undefined,
	}),
}));

const mockActiveTheme = vi.fn(() => null);

vi.mock('../../hooks/useActiveTheme', () => ({
	useActiveTheme: () => mockActiveTheme(),
}));

vi.mock('../public/PublicMemoRenderer', () => ({
	PublicMemoRenderer: ({ content }: { content: string }) =>
		React.createElement('div', { 'data-testid': 'public-memo-renderer', 'data-content': content }),
}));

import { MemoEditor } from './MemoEditor';
import { FocusMemoOverlay } from './FocusMemoOverlay';
import { useViewStore } from '../../stores/useViewStore';
import { useMemoDataStore } from '../../stores/useMemoDataStore';
import type { Memo } from '../../types/memo';

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

function buildMemo(overrides: Partial<Memo> = {}): Memo {
	return {
		id: 'memo-1',
		title: 'テストメモタイトル',
		content: '<p>テスト本文</p>',
		notebookId: null,
		memoTags: [],
		createdAt: new Date('2026-01-01').toISOString(),
		updatedAt: new Date('2026-01-01').toISOString(),
		trashedAt: null,
		...overrides,
	};
}

function renderIntegration(memo: Memo) {
	const Wrapper = createWrapper();
	return render(
		<>
			<MemoEditor memo={memo} />
			<FocusMemoOverlay />
		</>,
		{ wrapper: Wrapper },
	);
}

describe('表示モード統合テスト', () => {
	beforeEach(() => {
		cleanup();
		useViewStore.setState({ isDisplayMode: false });
		useMemoDataStore.setState({ selectedMemoId: 'memo-1' });
		mockActiveTheme.mockReturnValue(null);
	});

	afterEach(() => {
		document.body.style.overflow = '';
	});

	describe('Task 5.3-1: 起動フロー', () => {
		it('初期状態では FocusMemoOverlay が DOM に存在しない', () => {
			renderIntegration(buildMemo());
			expect(document.querySelector('[data-testid="focus-memo-overlay"]')).toBeNull();
		});

		it('起動ボタンクリック後に FocusMemoOverlay がマウントされる', async () => {
			renderIntegration(buildMemo());

			act(() => {
				fireEvent.click(screen.getByTestId('display-mode-button'));
			});

			expect(document.querySelector('[data-testid="focus-memo-overlay"]')).toBeTruthy();
		});

		it('起動後にメモタイトルが表示される', () => {
			renderIntegration(buildMemo());

			act(() => {
				fireEvent.click(screen.getByTestId('display-mode-button'));
			});

			expect(screen.getByTestId('memo-title').textContent).toBe('テストメモタイトル');
		});
	});

	describe('Task 5.3-2: 終了フロー', () => {
		it('ESC キー押下で FocusMemoOverlay がアンマウントされる', () => {
			renderIntegration(buildMemo());

			act(() => {
				fireEvent.click(screen.getByTestId('display-mode-button'));
			});
			expect(document.querySelector('[data-testid="focus-memo-overlay"]')).toBeTruthy();

			act(() => {
				fireEvent.keyDown(document, { key: 'Escape' });
			});
			expect(document.querySelector('[data-testid="focus-memo-overlay"]')).toBeNull();
		});

		it('閉じるボタンクリックで FocusMemoOverlay がアンマウントされる', () => {
			renderIntegration(buildMemo());

			act(() => {
				fireEvent.click(screen.getByTestId('display-mode-button'));
			});
			expect(document.querySelector('[data-testid="focus-memo-overlay"]')).toBeTruthy();

			act(() => {
				const closeBtn = document.querySelector('[data-testid="close-button"]');
				if (closeBtn) fireEvent.click(closeBtn);
			});
			expect(document.querySelector('[data-testid="focus-memo-overlay"]')).toBeNull();
		});

		it('背景クリックで FocusMemoOverlay がアンマウントされる', () => {
			renderIntegration(buildMemo());

			act(() => {
				fireEvent.click(screen.getByTestId('display-mode-button'));
			});
			expect(document.querySelector('[data-testid="focus-memo-overlay"]')).toBeTruthy();

			act(() => {
				const overlay = document.querySelector('[data-testid="focus-memo-overlay"]');
				if (overlay) fireEvent.click(overlay);
			});
			expect(document.querySelector('[data-testid="focus-memo-overlay"]')).toBeNull();
		});
	});

	describe('Task 5.3-3: テーマ適用', () => {
		it('テーマ設定済みで表示モード起動したとき、data-theme-id がオーバーレイに適用される', () => {
			mockActiveTheme.mockReturnValue({
				id: 'theme-forest',
				name: 'Forest',
				styles: {},
				cssFilePath: '/themes/nature/forest.css',
				metadata: {},
			});
			renderIntegration(buildMemo());

			act(() => {
				fireEvent.click(screen.getByTestId('display-mode-button'));
			});

			const overlay = document.querySelector('[data-testid="focus-memo-overlay"]');
			expect(overlay?.getAttribute('data-theme-id')).toBe('theme-forest');
		});

		it('テーマ未設定のとき data-theme-id 属性がない', () => {
			mockActiveTheme.mockReturnValue(null);
			renderIntegration(buildMemo());

			act(() => {
				fireEvent.click(screen.getByTestId('display-mode-button'));
			});

			const overlay = document.querySelector('[data-testid="focus-memo-overlay"]');
			expect(overlay?.hasAttribute('data-theme-id')).toBe(false);
		});
	});
});

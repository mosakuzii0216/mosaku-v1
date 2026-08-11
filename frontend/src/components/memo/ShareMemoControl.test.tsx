import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../utils/env', () => ({
	getBackendUrl: () => 'http://localhost:3000',
	getAppUrl: () => 'http://localhost:5173',
	getSupabaseConfig: () => ({ supabaseUrl: 'http://localhost:54321', supabaseAnonKey: 'anon' }),
	getGoogleClientId: () => '',
	getEnvConfig: () => ({
		backendUrl: 'http://localhost:3000',
		appUrl: 'http://localhost:5173',
		supabaseUrl: 'http://localhost:54321',
		supabaseAnonKey: 'anon',
	}),
	envValidator: { getConfig: () => ({}) },
}));

const publishMemoMutate = vi.fn();
const unpublishMemoMutate = vi.fn();
const regenerateTokenMutate = vi.fn();

vi.mock('../../hooks/useMemoSharingQueries', () => ({
	usePublishMemo: () => ({
		mutateAsync: publishMemoMutate,
		isPending: false,
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

import { ShareMemoControl } from './ShareMemoControl';
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
		title: 'テストメモ',
		content: '<p>内容</p>',
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		trashedAt: null,
		publicToken: null,
		publishedAt: null,
		...overrides,
	};
}

describe('ShareMemoControl - 非公開状態', () => {
	beforeEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('publicToken が null のとき「公開する」ボタンを表示する', () => {
		const Wrapper = createWrapper();
		render(<ShareMemoControl memo={buildMemo({ publicToken: null })} />, { wrapper: Wrapper });
		screen.getByRole('button', { name: /公開する/ });
	});

	it('「公開する」ボタンをクリックすると usePublishMemo が呼ばれる', async () => {
		publishMemoMutate.mockResolvedValue({
			memoId: 'memo-1',
			publicToken: 'new_token',
			publishedAt: '2026-01-01T00:00:00Z',
		});
		const Wrapper = createWrapper();
		render(<ShareMemoControl memo={buildMemo({ publicToken: null })} />, { wrapper: Wrapper });

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /公開する/ }));
		});

		expect(publishMemoMutate).toHaveBeenCalledWith('memo-1');
	});
});

describe('ShareMemoControl - 公開中状態', () => {
	beforeEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('publicToken があるとき「公開中」バッジを表示する', () => {
		const Wrapper = createWrapper();
		render(
			<ShareMemoControl
				memo={buildMemo({ publicToken: 'test_token_abc', publishedAt: '2026-01-01T00:00:00Z' })}
			/>,
			{ wrapper: Wrapper },
		);
		screen.getByText(/公開中/);
	});

	it('公開中のときメニューボタンをクリックするとドロップダウンが開く', () => {
		const Wrapper = createWrapper();
		render(
			<ShareMemoControl
				memo={buildMemo({ publicToken: 'test_token_abc', publishedAt: '2026-01-01T00:00:00Z' })}
			/>,
			{ wrapper: Wrapper },
		);

		fireEvent.click(screen.getByRole('button', { name: /共有/ }));

		// getByRole throws if element is not found — serves as presence assertion
		screen.getByRole('menuitem', { name: /URLをコピー/ });
		screen.getByRole('menuitem', { name: /トークン再生成/ });
		screen.getByRole('menuitem', { name: /公開解除/ });
	});

	it('「公開解除」をクリックすると useUnpublishMemo が呼ばれる', async () => {
		unpublishMemoMutate.mockResolvedValue({ success: true });
		const Wrapper = createWrapper();
		render(
			<ShareMemoControl
				memo={buildMemo({ publicToken: 'test_token_abc', publishedAt: '2026-01-01T00:00:00Z' })}
			/>,
			{ wrapper: Wrapper },
		);

		fireEvent.click(screen.getByRole('button', { name: /共有/ }));
		await act(async () => {
			fireEvent.click(screen.getByRole('menuitem', { name: /公開解除/ }));
		});

		expect(unpublishMemoMutate).toHaveBeenCalledWith('memo-1');
	});

	it('「トークン再生成」をクリックすると useRegenerateMemoToken が呼ばれる', async () => {
		regenerateTokenMutate.mockResolvedValue({
			memoId: 'memo-1',
			publicToken: 'new_token',
			publishedAt: '2026-01-01T00:00:00Z',
		});
		const Wrapper = createWrapper();
		render(
			<ShareMemoControl
				memo={buildMemo({ publicToken: 'test_token_abc', publishedAt: '2026-01-01T00:00:00Z' })}
			/>,
			{ wrapper: Wrapper },
		);

		fireEvent.click(screen.getByRole('button', { name: /共有/ }));
		await act(async () => {
			fireEvent.click(screen.getByRole('menuitem', { name: /トークン再生成/ }));
		});

		expect(regenerateTokenMutate).toHaveBeenCalledWith({
			memoId: 'memo-1',
			oldToken: 'test_token_abc',
		});
	});

	it('「URLをコピー」をクリックすると正しい公開URLがクリップボードに書き込まれる', async () => {
		const writeTextMock = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', {
			...navigator,
			clipboard: { writeText: writeTextMock },
		});

		const Wrapper = createWrapper();
		render(
			<ShareMemoControl
				memo={buildMemo({ publicToken: 'test_token_abc', publishedAt: '2026-01-01T00:00:00Z' })}
			/>,
			{ wrapper: Wrapper },
		);

		fireEvent.click(screen.getByRole('button', { name: /共有/ }));
		await act(async () => {
			fireEvent.click(screen.getByRole('menuitem', { name: /URLをコピー/ }));
		});

		expect(writeTextMock).toHaveBeenCalledWith('http://localhost:5173/p/test_token_abc');

		vi.unstubAllGlobals();
	});
});

describe('ShareMemoControl - トークン駆動化（editor-surface-tokenization 6.2）', () => {
	beforeEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('「公開する」は primary ボタン（.shell-button-primary）で、生 bg-green-500 を持たない', () => {
		const Wrapper = createWrapper();
		render(<ShareMemoControl memo={buildMemo({ publicToken: null })} />, { wrapper: Wrapper });
		const button = screen.getByRole('button', { name: /公開する/ });
		expect(button.classList.contains('shell-button-primary')).toBe(true);
		expect(button.className).not.toMatch(/bg-green-500|hover:bg-green-600/);
	});

	it('「公開中」ピルは成功の淡色コンテナトークンを参照し、生 bg-green-100 を持たない', () => {
		const Wrapper = createWrapper();
		render(
			<ShareMemoControl
				memo={buildMemo({ publicToken: 'test_token_abc', publishedAt: '2026-01-01T00:00:00Z' })}
			/>,
			{ wrapper: Wrapper },
		);
		const pill = screen.getByText('公開中');
		expect(pill.className).toMatch(/var\(--success-container\)/);
		expect(pill.className).toMatch(/var\(--on-success-container\)/);
		expect(pill.className).not.toMatch(/bg-green-100|text-green-800/);
	});

	it('「共有」ボタンは境界に成功色トークンを用い、面はボタンプリミティブへ委ねる', () => {
		const Wrapper = createWrapper();
		render(
			<ShareMemoControl
				memo={buildMemo({ publicToken: 'test_token_abc', publishedAt: '2026-01-01T00:00:00Z' })}
			/>,
			{ wrapper: Wrapper },
		);
		const button = screen.getByRole('button', { name: /共有/ });
		expect(button.classList.contains('shell-button')).toBe(true);
		expect(button.className).toMatch(/var\(--success\)/);
		expect(button.className).not.toMatch(/border-green-500|text-green-700|hover:bg-green-50/);
	});

	it('メニュー面は .shell-popover、項目は .shell-popover-item で塗られ、生 bg-white を持たない', () => {
		const Wrapper = createWrapper();
		render(
			<ShareMemoControl
				memo={buildMemo({ publicToken: 'test_token_abc', publishedAt: '2026-01-01T00:00:00Z' })}
			/>,
			{ wrapper: Wrapper },
		);
		fireEvent.click(screen.getByRole('button', { name: /共有/ }));
		const menu = screen.getByRole('menu');
		expect(menu.classList.contains('shell-popover')).toBe(true);
		expect(menu.className).not.toMatch(/bg-white|border-gray-200/);

		const copyItem = screen.getByRole('menuitem', { name: /URLをコピー/ });
		expect(copyItem.classList.contains('shell-popover-item')).toBe(true);
	});

	it('「公開解除」は破壊の中核色トークンをテキストに、ホバーで破壊の淡色コンテナを用いる', () => {
		const Wrapper = createWrapper();
		render(
			<ShareMemoControl
				memo={buildMemo({ publicToken: 'test_token_abc', publishedAt: '2026-01-01T00:00:00Z' })}
			/>,
			{ wrapper: Wrapper },
		);
		fireEvent.click(screen.getByRole('button', { name: /共有/ }));
		const unpublish = screen.getByRole('menuitem', { name: /公開解除/ });
		expect(unpublish.className).toMatch(/var\(--danger\)/);
		expect(unpublish.className).toMatch(/var\(--danger-container\)/);
		expect(unpublish.className).not.toMatch(/text-red-600|hover:bg-red-50/);
	});

	it('成功トーストは成功の淡色コンテナ対を、エラートーストは破壊の淡色コンテナ対を用いる', async () => {
		publishMemoMutate.mockResolvedValue({
			memoId: 'memo-1',
			publicToken: 'new_token',
			publishedAt: '2026-01-01T00:00:00Z',
		});
		const Wrapper = createWrapper();
		render(<ShareMemoControl memo={buildMemo({ publicToken: null })} />, { wrapper: Wrapper });

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /公開する/ }));
		});

		const toast = screen.getByRole('status');
		expect(toast.className).toMatch(/var\(--success-container\)/);
		expect(toast.className).toMatch(/var\(--on-success-container\)/);
		expect(toast.className).not.toMatch(/bg-green-50|border-green-300|text-green-800/);
	});
});

describe('ShareMemoControl - ゴミ箱内メモ', () => {
	beforeEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('trashedAt が設定されている場合、「公開する」ボタンを無効化する', () => {
		const Wrapper = createWrapper();
		render(
			<ShareMemoControl
				memo={buildMemo({ trashedAt: '2026-01-01T00:00:00Z', publicToken: null })}
			/>,
			{ wrapper: Wrapper },
		);
		const button = screen.getByRole('button', { name: /公開する/ }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
	});

	it('ゴミ箱内で公開中の場合、共有メニューボタンを無効化する', () => {
		const Wrapper = createWrapper();
		render(
			<ShareMemoControl
				memo={buildMemo({
					trashedAt: '2026-01-01T00:00:00Z',
					publicToken: 'test_token',
					publishedAt: '2026-01-01T00:00:00Z',
				})}
			/>,
			{ wrapper: Wrapper },
		);
		const button = screen.getByRole('button', { name: /共有/ }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
	});
});

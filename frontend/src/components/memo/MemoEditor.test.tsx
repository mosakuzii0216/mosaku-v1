import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// env 関連は auth.ts の static initializer が import 時に走るので最初にモックする
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

import { MemoEditor } from './MemoEditor';
import { useViewStore } from '../../stores/useViewStore';
import type { Memo } from '../../types/memo';

// RichTextEditor は tiptap 依存が重いので、スタブに置き換える
vi.mock('../editor/RichTextEditor', () => ({
	RichTextEditor: () => <div data-testid="memo-content-editor" />,
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

// useUpdateMemo は in-flight にしておく必要はなく、scheduleAutoSave の発火と関係なく
// 「memo prop が新オブジェクトで再渡しされた時に state が上書きされるか」を検証したいので
// シンプルに mutate を no-op にする。
const updateMutate = vi.fn();
const createMutate = vi.fn();
const deleteMutateAsync = vi.fn();

vi.mock('../../hooks/useMemoQueries', () => ({
	useCreateMemo: () => ({ mutate: createMutate, isPending: false }),
	useUpdateMemo: () => ({ mutate: updateMutate, isPending: false }),
	useDeleteMemo: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
}));

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
		title: 'Hello',
		content: {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
		},
		notebookId: null,
		memoTags: [],
		createdAt: new Date('2026-01-01').toISOString(),
		updatedAt: new Date('2026-01-01').toISOString(),
		trashedAt: null,
		...overrides,
	};
}

describe('MemoEditor - 自動保存中の入力保持', () => {
	beforeEach(() => {
		cleanup();
		updateMutate.mockReset();
		createMutate.mockReset();
		deleteMutateAsync.mockReset();
	});

	it('保存後に同じ id の memo prop が新しい参照で渡し直されても、直近の入力が消えない', () => {
		const Wrapper = createWrapper();
		const initialMemo = buildMemo({ title: 'Hello' });

		const { rerender } = render(<MemoEditor memo={initialMemo} />, { wrapper: Wrapper });

		const titleInput = screen.getByPlaceholderText('タイトル') as HTMLInputElement;
		expect(titleInput.value).toBe('Hello');

		// ユーザーが続けて入力（保存デバウンス中 〜 サーバー応答中の状態を模す）
		act(() => {
			fireEvent.change(titleInput, { target: { value: 'Hello World' } });
		});
		expect(titleInput.value).toBe('Hello World');

		// 保存完了→ React Query の invalidateQueries により、親で list が refetch され、
		// 同じ id・同じ中身の memo が「新オブジェクト」として props 経由で再渡しされるケースを模す。
		// （サーバーが返した値はユーザーが叩いた "World" を含まない、保存前の "Hello" のまま）
		const refreshedMemo = buildMemo({ title: 'Hello' });
		expect(refreshedMemo).not.toBe(initialMemo); // 参照は別

		rerender(<MemoEditor memo={refreshedMemo} />);

		// バグ: useEffect の依存が memo オブジェクト全体になっていると、参照変更で再発火し、
		// setTitle("Hello") が走って "Hello World" が "Hello" に巻き戻る。
		// 期待: 同じ id を編集中の間は state は保持される。
		expect(titleInput.value).toBe('Hello World');
	});

	it('新規作成→編集モード昇格時に、保存往復中に打った文字が巻き戻らない', async () => {
		const Wrapper = createWrapper();
		const createdId = 'created-1';
		// create のレスポンスは "te" まで（往復中にユーザーは "test" まで打ち進める）
		createMutate.mockImplementation(
			(_payload: unknown, opts: { onSuccess: (memo: Memo) => void }) => {
				opts.onSuccess(buildMemo({ id: createdId, title: 'te' }));
			},
		);

		const { rerender } = render(<MemoEditor isCreate />, { wrapper: Wrapper });
		const titleInput = screen.getByPlaceholderText('タイトル') as HTMLInputElement;

		// "te" まで打って手動保存 → create 確定（昇格マーカーがセットされる）
		act(() => {
			fireEvent.change(titleInput, { target: { value: 'te' } });
		});
		await act(async () => {
			fireEvent.click(screen.getByText('保存'));
		});
		expect(createMutate).toHaveBeenCalled();

		// 往復中にさらに打ち進めて "test" に
		act(() => {
			fireEvent.change(titleInput, { target: { value: 'test' } });
		});
		expect(titleInput.value).toBe('test');

		// 親が create 結果（stale な "te"）を memo prop として渡し、edit モードへ昇格
		rerender(<MemoEditor memo={buildMemo({ id: createdId, title: 'te' })} />);

		// バグ: 昇格時の state 再同期で setTitle("te") が走り "test" が "te" に巻き戻る。
		// 期待: 自分が作ったメモへの昇格中はローカル入力を維持する。
		expect(titleInput.value).toBe('test');
	});

	it('別の id の memo に切り替わった場合は、新しい memo の内容で state が更新される', () => {
		const Wrapper = createWrapper();
		const memoA = buildMemo({ id: 'memo-a', title: 'A title' });

		const { rerender } = render(<MemoEditor memo={memoA} />, { wrapper: Wrapper });

		const titleInput = screen.getByPlaceholderText('タイトル') as HTMLInputElement;
		expect(titleInput.value).toBe('A title');

		const memoB = buildMemo({ id: 'memo-b', title: 'B title' });
		rerender(<MemoEditor memo={memoB} />);

		expect(titleInput.value).toBe('B title');
	});
});

describe('MemoEditor - 保存状態インジケーター', () => {
	beforeEach(() => {
		cleanup();
		updateMutate.mockReset();
		createMutate.mockReset();
		deleteMutateAsync.mockReset();
	});

	it('既存メモの初期表示（未編集）で「保存済み」と相対時刻が表示される', () => {
		const Wrapper = createWrapper();
		// updatedAt はテスト実行時刻からの相対表示になるので、テスト時刻基準で過去30日以内に収まる時刻を設定
		const memo = buildMemo({ updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() });

		render(<MemoEditor memo={memo} />, { wrapper: Wrapper });

		const label = screen.getByTestId('save-status-label').textContent ?? '';
		expect(label).toContain('保存済み');
		expect(label).toContain('5分前');
	});

	it('updatedAt が無い既存メモでも「保存済み」だけは表示される', () => {
		const Wrapper = createWrapper();
		const memo = buildMemo({ updatedAt: '' });

		render(<MemoEditor memo={memo} />, { wrapper: Wrapper });

		expect(screen.getByTestId('save-status-label').textContent).toBe('保存済み');
	});

	it('新規作成画面（未入力）では保存状態インジケーターが表示されない', () => {
		const Wrapper = createWrapper();

		render(<MemoEditor isCreate />, { wrapper: Wrapper });

		expect(screen.queryByTestId('save-status-label')).toBeNull();
	});

	it('既存メモを編集すると「未保存」が表示される', () => {
		const Wrapper = createWrapper();
		const memo = buildMemo();

		render(<MemoEditor memo={memo} />, { wrapper: Wrapper });

		const titleInput = screen.getByPlaceholderText('タイトル') as HTMLInputElement;
		act(() => {
			fireEvent.change(titleInput, { target: { value: 'Hello World' } });
		});

		expect(screen.getByTestId('save-status-label').textContent).toBe('未保存');
	});
});

describe('MemoEditor - 表示モード起動ボタン', () => {
	beforeEach(() => {
		cleanup();
		updateMutate.mockReset();
		createMutate.mockReset();
		deleteMutateAsync.mockReset();
		useViewStore.setState({ isDisplayMode: false });
	});

	it('既存メモ表示時に表示モードボタンが存在する', () => {
		const Wrapper = createWrapper();
		const memo = buildMemo();

		render(<MemoEditor memo={memo} />, { wrapper: Wrapper });

		expect(screen.getByTestId('display-mode-button')).toBeTruthy();
	});

	it('新規作成モード（isCreate=true）では表示モードボタンが存在しない', () => {
		const Wrapper = createWrapper();

		render(<MemoEditor isCreate />, { wrapper: Wrapper });

		expect(screen.queryByTestId('display-mode-button')).toBeNull();
	});

	it('表示モードボタンをクリックすると isDisplayMode が true になる', () => {
		const Wrapper = createWrapper();
		const memo = buildMemo();

		render(<MemoEditor memo={memo} />, { wrapper: Wrapper });

		expect(useViewStore.getState().isDisplayMode).toBe(false);

		act(() => {
			fireEvent.click(screen.getByTestId('display-mode-button'));
		});

		expect(useViewStore.getState().isDisplayMode).toBe(true);
	});
});

describe('MemoEditor - Prose Bridge（本文編集面の色所有権整理・editor-surface-tokenization Task 4）', () => {
	beforeEach(() => {
		cleanup();
	});

	it('.memo-content ラッパーに .shell-prose-host を併記する（4.1）', () => {
		const Wrapper = createWrapper();
		const memo = buildMemo();

		const { container } = render(<MemoEditor memo={memo} />, { wrapper: Wrapper });

		const wrapper = container.querySelector('.memo-content');
		expect(wrapper?.className).toContain('shell-prose-host');
	});
});

describe('MemoEditor - 残存直書きの解消（editor-surface-tokenization Task 6.5）', () => {
	beforeEach(() => {
		cleanup();
		updateMutate.mockReset();
		createMutate.mockReset();
		deleteMutateAsync.mockReset();
	});

	it('ヘッダー境界はトークン境界（var(--outline)）を参照し、生 border-gray-200 を持たない', () => {
		const Wrapper = createWrapper();
		const memo = buildMemo();
		const { container } = render(<MemoEditor memo={memo} />, { wrapper: Wrapper });

		const header = container.querySelector('.border-b') as HTMLElement;
		expect(header.className).toMatch(/var\(--outline\)/);
		expect(header.className).not.toMatch(/border-gray-200/);
	});

	it('保存ボタンは .shell-button-primary で塗られ、生 bg-blue-500 を持たない', () => {
		const Wrapper = createWrapper();
		const memo = buildMemo();
		render(<MemoEditor memo={memo} />, { wrapper: Wrapper });

		const saveButton = screen.getByRole('button', { name: /保存/ });
		expect(saveButton.classList.contains('shell-button-primary')).toBe(true);
		expect(saveButton.className).not.toMatch(/bg-blue-500|hover:bg-blue-600/);
	});

	it('削除ボタンは破壊の中核色トークンとその前景を参照し、生 bg-red-500 を持たない', () => {
		const Wrapper = createWrapper();
		const memo = buildMemo();
		render(<MemoEditor memo={memo} />, { wrapper: Wrapper });

		const deleteButton = screen.getByRole('button', { name: /削除/ });
		expect(deleteButton.className).toMatch(/var\(--danger\)/);
		expect(deleteButton.className).toMatch(/var\(--on-danger\)/);
		expect(deleteButton.className).not.toMatch(/bg-red-500|hover:bg-red-600/);
	});

	it('タグ表示は低強調トークン（.shell-text-muted）を参照し、生 text-gray-600 を持たない', () => {
		const Wrapper = createWrapper();
		const memo = buildMemo({
			memoTags: [
				{
					memoId: 'memo-1',
					tagId: 'tag-1',
					tag: {
						id: 'tag-1',
						name: 'タグA',
						color: '#123456',
						createdAt: new Date('2026-01-01').toISOString(),
						updatedAt: new Date('2026-01-01').toISOString(),
					},
				},
			],
		});
		const { container } = render(<MemoEditor memo={memo} />, { wrapper: Wrapper });

		const tagWrapper = container.querySelector('.mb-3.flex.flex-wrap') as HTMLElement;
		expect(tagWrapper.classList.contains('shell-text-muted')).toBe(true);
		expect(tagWrapper.className).not.toMatch(/text-gray-600/);
	});

	it('タイトル入力は入力プリミティブのプレースホルダ契約（var(--on-surface-variant)）へ寄せ、生 placeholder-gray-400 を持たない', () => {
		const Wrapper = createWrapper();
		const memo = buildMemo();
		render(<MemoEditor memo={memo} />, { wrapper: Wrapper });

		const titleInput = screen.getByPlaceholderText('タイトル');
		expect(titleInput.className).toMatch(/var\(--on-surface-variant\)/);
		expect(titleInput.className).not.toMatch(/placeholder-gray-400/);
	});

	it('既にトークン化済みの表示モード切替ボタンは .shell-button のまま変更しない', () => {
		const Wrapper = createWrapper();
		const memo = buildMemo();
		render(<MemoEditor memo={memo} />, { wrapper: Wrapper });

		expect(screen.getByTestId('display-mode-button').classList.contains('shell-button')).toBe(true);
	});
});

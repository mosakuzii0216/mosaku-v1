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
	getGithubClientId: () => '',
	getEnvConfig: () => ({
		backendUrl: 'http://localhost:3000',
		appUrl: 'http://localhost:5173',
		supabaseUrl: 'http://localhost:54321',
		supabaseAnonKey: 'anon',
	}),
	envValidator: { getConfig: () => ({}) },
}));

import { MemoEditor } from './MemoEditor';
import type { Memo } from '../../types/memo';

// RichTextEditor は tiptap 依存が重いので、content/onChange だけを持つ textarea スタブに置き換える
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
		content: '<p>Hello</p>',
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
		const initialMemo = buildMemo({ title: 'Hello', content: '<p>Hello</p>' });

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
		const refreshedMemo = buildMemo({ title: 'Hello', content: '<p>Hello</p>' });
		expect(refreshedMemo).not.toBe(initialMemo); // 参照は別

		rerender(<MemoEditor memo={refreshedMemo} />);

		// バグ: useEffect の依存が memo オブジェクト全体になっていると、参照変更で再発火し、
		// setTitle("Hello") が走って "Hello World" が "Hello" に巻き戻る。
		// 期待: 同じ id を編集中の間は state は保持される。
		expect(titleInput.value).toBe('Hello World');
	});

	it('別の id の memo に切り替わった場合は、新しい memo の内容で state が更新される', () => {
		const Wrapper = createWrapper();
		const memoA = buildMemo({ id: 'memo-a', title: 'A title', content: '<p>A</p>' });

		const { rerender } = render(<MemoEditor memo={memoA} />, { wrapper: Wrapper });

		const titleInput = screen.getByPlaceholderText('タイトル') as HTMLInputElement;
		expect(titleInput.value).toBe('A title');

		const memoB = buildMemo({ id: 'memo-b', title: 'B title', content: '<p>B</p>' });
		rerender(<MemoEditor memo={memoB} />);

		expect(titleInput.value).toBe('B title');
	});
});

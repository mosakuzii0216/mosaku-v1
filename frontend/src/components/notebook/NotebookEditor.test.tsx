import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
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

import { NotebookEditor } from './NotebookEditor';
import { useViewStore } from '../../stores/useViewStore';
import { useMemoDataStore } from '../../stores/useMemoDataStore';
import type { Notebook } from '../../types/notebook';

vi.mock('../editor/RichTextEditor', () => ({
	RichTextEditor: () => <div data-testid="notebook-content-editor" />,
}));

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();

vi.mock('../../hooks/useNotebookQueries', () => ({
	useCreateNotebook: () => ({ mutateAsync: createMutateAsync, isPending: false }),
	useUpdateNotebook: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
	useNotebook: (id?: string) => ({
		data: id ? mockNotebookMap[id] : undefined,
		isLoading: false,
	}),
}));

const mockUseSystemThemes = vi.fn(() => ({
	data: [] as { id: string; name: string }[],
	isLoading: false,
}));

vi.mock('../../hooks/useThemeQueries', () => ({
	useSystemThemes: (...args: unknown[]) => mockUseSystemThemes(...args),
	usePublicThemes: () => ({ data: [], isLoading: false }),
}));

const mockUseTagQueries = vi.fn(() => ({
	tagsQuery: { data: [] as { id: string; name: string; color: string }[] },
}));

vi.mock('../../hooks/useTagQueries', () => ({
	useTagQueries: (...args: unknown[]) => mockUseTagQueries(...args),
}));

vi.mock('../../hooks/useThemeCSS', () => ({
	useThemeCSS: () => undefined,
}));

const mockGetNotebookTags = vi.fn().mockResolvedValue([]);
const mockAssignTagsToNotebook = vi.fn().mockResolvedValue({});

vi.mock('../../utils/api', () => ({
	apiClient: {
		getNotebookTags: (...args: unknown[]) => mockGetNotebookTags(...args),
		assignTagsToNotebook: (...args: unknown[]) => mockAssignTagsToNotebook(...args),
	},
}));

// 動的に参照できる notebook マップ
const mockNotebookMap: Record<string, Notebook> = {};

function buildNotebook(overrides: Partial<Notebook> = {}): Notebook {
	return {
		id: 'nb-1',
		name: 'My Notebook',
		content: { type: 'doc', content: [{ type: 'paragraph' }] },
		createdAt: new Date('2026-01-01').toISOString(),
		updatedAt: new Date('2026-01-01').toISOString(),
		themeId: null,
		theme: null,
		...overrides,
	};
}

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

const DEBOUNCE_MS = 200;

describe('NotebookEditor - 純保存関数（遷移副作用の分離）', () => {
	beforeEach(() => {
		cleanup();
		createMutateAsync.mockReset();
		updateMutateAsync.mockReset();
		mockGetNotebookTags.mockReset().mockResolvedValue([]);
		mockAssignTagsToNotebook.mockReset().mockResolvedValue({});
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('name と content がともに空の場合は保存を実行しない', async () => {
		const Wrapper = createWrapper();
		render(<NotebookEditor isCreate />, { wrapper: Wrapper });

		// 何も入力せずタイマーを進める
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});

		expect(createMutateAsync).not.toHaveBeenCalled();
	});

	it('既存ノート編集の自動保存成功時に goToNotebookList が呼ばれない', async () => {
		const nb = buildNotebook({ id: 'nb-edit' });
		mockNotebookMap['nb-edit'] = nb;
		updateMutateAsync.mockResolvedValue(nb);

		const Wrapper = createWrapper();
		render(<NotebookEditor notebookId="nb-edit" />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'Updated Name' } });
		});

		// goToNotebookList の spy
		const goToNotebookList = vi.spyOn(useViewStore.getState(), 'goToNotebookList');

		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});

		expect(updateMutateAsync).toHaveBeenCalledTimes(1);
		expect(goToNotebookList).not.toHaveBeenCalled();

		delete mockNotebookMap['nb-edit'];
	});
});

describe('NotebookEditor - useAutoSave 配線と debounce トリガー', () => {
	beforeEach(() => {
		cleanup();
		createMutateAsync.mockReset();
		updateMutateAsync.mockReset();
		mockGetNotebookTags.mockReset().mockResolvedValue([]);
		mockAssignTagsToNotebook.mockReset().mockResolvedValue({});
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('name 変更後 debounce 後に updateNotebook が 1 回だけ実行される', async () => {
		const nb = buildNotebook({ id: 'nb-debounce' });
		mockNotebookMap['nb-debounce'] = nb;
		updateMutateAsync.mockResolvedValue(nb);

		const Wrapper = createWrapper();
		render(<NotebookEditor notebookId="nb-debounce" />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		// 複数回変更してもタイマーリセットで 1 回のみ
		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'Draft' } });
		});
		await act(async () => {
			vi.advanceTimersByTime(50);
		});
		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'Draft v2' } });
		});
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});

		expect(updateMutateAsync).toHaveBeenCalledTimes(1);
		expect(updateMutateAsync).toHaveBeenCalledWith({
			id: 'nb-debounce',
			data: expect.objectContaining({ name: 'Draft v2' }),
		});

		delete mockNotebookMap['nb-debounce'];
	});

	it('保存状態インジケーターが保存成功後に「保存済み」を表示する', async () => {
		const nb = buildNotebook({ id: 'nb-saved' });
		mockNotebookMap['nb-saved'] = nb;
		updateMutateAsync.mockResolvedValue(nb);

		const Wrapper = createWrapper();
		render(<NotebookEditor notebookId="nb-saved" />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'Changed' } });
		});
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		// Promise が resolve するのを待つ
		await act(async () => {
			await Promise.resolve();
		});

		const statusLabel = screen.queryByTestId('notebook-save-status-label');
		expect(statusLabel?.textContent).toContain('保存済み');

		delete mockNotebookMap['nb-saved'];
	});
});

describe('NotebookEditor - 新規作成の自動保存と編集モード内部遷移', () => {
	beforeEach(() => {
		cleanup();
		createMutateAsync.mockReset();
		updateMutateAsync.mockReset();
		mockGetNotebookTags.mockReset().mockResolvedValue([]);
		mockAssignTagsToNotebook.mockReset().mockResolvedValue({});
		useMemoDataStore.setState({ selectedNotebookId: null });
		useViewStore.setState({ currentView: 'create', currentObject: 'notebook' });
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('新規作成中に name 入力後 debounce 発火で createNotebook が 1 回呼ばれる', async () => {
		const createdNb = buildNotebook({ id: 'nb-new' });
		createMutateAsync.mockResolvedValue(createdNb);

		const Wrapper = createWrapper();
		render(<NotebookEditor isCreate />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'New Notebook' } });
		});
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		await act(async () => {
			await Promise.resolve();
		});

		expect(createMutateAsync).toHaveBeenCalledTimes(1);
		expect(createMutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'New Notebook' }),
		);
	});

	it('新規作成の autosave 成功で goToNotebookList は呼ばれない', async () => {
		const createdNb = buildNotebook({ id: 'nb-new2' });
		createMutateAsync.mockResolvedValue(createdNb);

		const goToNotebookListSpy = vi.fn();
		useViewStore.setState({ goToNotebookList: goToNotebookListSpy });

		const Wrapper = createWrapper();
		render(<NotebookEditor isCreate />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'New Notebook 2' } });
		});
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		await act(async () => {
			await Promise.resolve();
		});

		expect(goToNotebookListSpy).not.toHaveBeenCalled();
	});

	it('新規作成の autosave 成功後 setCurrentView("edit") が呼ばれ selectedNotebookId が更新される', async () => {
		const createdNb = buildNotebook({ id: 'nb-new3' });
		createMutateAsync.mockResolvedValue(createdNb);

		const Wrapper = createWrapper();
		render(<NotebookEditor isCreate />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'New Notebook 3' } });
		});
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		await act(async () => {
			await Promise.resolve();
		});

		expect(useMemoDataStore.getState().selectedNotebookId).toBe('nb-new3');
		expect(useViewStore.getState().currentView).toBe('edit');
	});

	it('新規作成の autosave 成功後もユーザーの入力が保持される（一覧遷移なし・入力消失なし）', async () => {
		const createdNb = buildNotebook({ id: 'nb-input-kept' });
		createMutateAsync.mockResolvedValue(createdNb);

		const Wrapper = createWrapper();
		render(<NotebookEditor isCreate />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'My Draft Title' } });
		});
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		await act(async () => {
			await Promise.resolve();
		});

		// autosave 成功後もフォーム入力は保持される
		expect(nameInput.value).toBe('My Draft Title');
	});

	it('新規作成→編集モード昇格（isCreate→notebookId 遷移）で、保存往復中に打った文字が巻き戻らない', async () => {
		// create のレスポンスは "te" まで（往復中にユーザーは "test" まで打ち進める）
		const createdNb = buildNotebook({ id: 'nb-promote', name: 'te' });
		createMutateAsync.mockResolvedValue(createdNb);
		// 昇格後に useNotebook(id) が返す stale な値（サーバーは "te" のまま）
		mockNotebookMap['nb-promote'] = createdNb;

		const Wrapper = createWrapper();
		const { rerender } = render(<NotebookEditor isCreate />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		// "te" まで打って debounce 発火 → create 確定（昇格マーカーがセットされる）
		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'te' } });
		});
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		await act(async () => {
			await Promise.resolve();
		});
		expect(createMutateAsync).toHaveBeenCalledTimes(1);

		// 往復中にさらに打ち進めて "test" に
		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'test' } });
		});
		expect(nameInput.value).toBe('test');

		// 親が edit モードへ昇格させ、notebookId 付きで再レンダー（stale な "te" が返る）
		rerender(<NotebookEditor notebookId="nb-promote" />);

		// バグ: 昇格時の再同期で setName("te") が走り "test" が "te" に巻き戻る。
		// 期待: 自分が作ったノートへの昇格中はローカル入力を維持する。
		expect(nameInput.value).toBe('test');
	});
});

describe('NotebookEditor - 編集対象切替の再同期 ref ガード', () => {
	beforeEach(() => {
		cleanup();
		createMutateAsync.mockReset();
		updateMutateAsync.mockReset();
		mockGetNotebookTags.mockReset().mockResolvedValue([]);
		mockAssignTagsToNotebook.mockReset().mockResolvedValue({});
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		// クリーンアップ
		Object.keys(mockNotebookMap).forEach((k) => delete mockNotebookMap[k]);
	});

	it('同一 id の notebook prop が新しい参照で渡し直されてもフォーム state が上書きされない', async () => {
		const nb = buildNotebook({ id: 'nb-churn', name: 'Original' });
		mockNotebookMap['nb-churn'] = nb;

		const Wrapper = createWrapper();
		const { rerender } = render(<NotebookEditor notebookId="nb-churn" />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		// ユーザーが入力を変更
		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'Edited Name' } });
		});
		expect(nameInput.value).toBe('Edited Name');

		// 同じ id の notebook が新しい参照で渡し直される（React Query の再フェッチを模す）
		const refreshedNb = buildNotebook({ id: 'nb-churn', name: 'Original' });
		mockNotebookMap['nb-churn'] = refreshedNb;
		rerender(<NotebookEditor notebookId="nb-churn" />);

		// フォーム state は上書きされない
		expect(nameInput.value).toBe('Edited Name');
	});

	it('別の id の notebook に切り替えると新しい内容でフォーム state が更新される', async () => {
		const nbA = buildNotebook({ id: 'nb-a', name: 'Notebook A' });
		const nbB = buildNotebook({ id: 'nb-b', name: 'Notebook B' });
		mockNotebookMap['nb-a'] = nbA;
		mockNotebookMap['nb-b'] = nbB;

		const Wrapper = createWrapper();
		const { rerender } = render(<NotebookEditor notebookId="nb-a" />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		// nb-a の内容が表示されていることを確認（初回同期後）
		await act(async () => {
			await Promise.resolve();
		});
		expect(nameInput.value).toBe('Notebook A');

		// nb-b に切り替え
		rerender(<NotebookEditor notebookId="nb-b" />);

		await act(async () => {
			await Promise.resolve();
		});

		// nb-b の内容が表示される
		expect(nameInput.value).toBe('Notebook B');
	});

	it('別ノートへ切替時に前ノートへの debounce タイマーが混入しない', async () => {
		const nbA = buildNotebook({ id: 'nb-switch-a', name: 'Notebook Switch A' });
		const nbB = buildNotebook({ id: 'nb-switch-b', name: 'Notebook Switch B' });
		mockNotebookMap['nb-switch-a'] = nbA;
		mockNotebookMap['nb-switch-b'] = nbB;
		updateMutateAsync.mockResolvedValue(nbA);

		const Wrapper = createWrapper();
		const { rerender } = render(<NotebookEditor notebookId="nb-switch-a" />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		// notebook A で入力（debounce タイマーがスタート）
		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'Edited before switch' } });
		});

		// debounce 発火前に notebook B に切り替える
		rerender(<NotebookEditor notebookId="nb-switch-b" />);
		await act(async () => {
			await Promise.resolve();
		});

		// debounce 時間が経過しても notebook A への保存は発火しない
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		await act(async () => {
			await Promise.resolve();
		});

		expect(updateMutateAsync).not.toHaveBeenCalled();
	});
});

describe('NotebookEditor - 保存状態インジケーターの表示', () => {
	beforeEach(() => {
		cleanup();
		createMutateAsync.mockReset();
		updateMutateAsync.mockReset();
		mockGetNotebookTags.mockReset().mockResolvedValue([]);
		mockAssignTagsToNotebook.mockReset().mockResolvedValue({});
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		Object.keys(mockNotebookMap).forEach((k) => delete mockNotebookMap[k]);
	});

	it('既存ノート編集中で保存状態が idle のとき「保存済み」を表示する', async () => {
		const nb = buildNotebook({ id: 'nb-idle-existing' });
		mockNotebookMap['nb-idle-existing'] = nb;

		const Wrapper = createWrapper();
		render(<NotebookEditor notebookId="nb-idle-existing" />, { wrapper: Wrapper });

		// 再同期 effect が走るのを待つ
		await act(async () => {
			await Promise.resolve();
		});

		const statusLabel = screen.queryByTestId('notebook-save-status-label');
		expect(statusLabel?.textContent).toContain('保存済み');
	});

	it('新規作成中で保存対象が未確定のとき（idle）インジケーターを表示しない', async () => {
		const Wrapper = createWrapper();
		render(<NotebookEditor isCreate />, { wrapper: Wrapper });

		await act(async () => {
			await Promise.resolve();
		});

		const statusLabel = screen.queryByTestId('notebook-save-status-label');
		expect(statusLabel).toBeNull();
	});

	it('保存成功後のインジケーターに相対時刻が含まれる', async () => {
		const nb = buildNotebook({ id: 'nb-rel-time' });
		mockNotebookMap['nb-rel-time'] = nb;
		updateMutateAsync.mockResolvedValue(nb);

		const Wrapper = createWrapper();
		render(<NotebookEditor notebookId="nb-rel-time" />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'Updated' } });
		});
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		await act(async () => {
			await Promise.resolve();
		});

		const statusLabel = screen.queryByTestId('notebook-save-status-label');
		expect(statusLabel?.textContent).toContain('保存済み');
		// 相対時刻（今しがた or N分前 等）が含まれている
		expect(statusLabel?.textContent).toMatch(/（.+）/);

		delete mockNotebookMap['nb-rel-time'];
	});
});

describe('NotebookEditor - 明示保存（ボタン・キーボードショートカット）の併存', () => {
	beforeEach(() => {
		cleanup();
		createMutateAsync.mockReset();
		updateMutateAsync.mockReset();
		mockGetNotebookTags.mockReset().mockResolvedValue([]);
		mockAssignTagsToNotebook.mockReset().mockResolvedValue({});
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		Object.keys(mockNotebookMap).forEach((k) => delete mockNotebookMap[k]);
	});

	it('変更がないとき保存ボタンが非活性になる', async () => {
		const nb = buildNotebook({ id: 'nb-btn-disabled' });
		mockNotebookMap['nb-btn-disabled'] = nb;

		const Wrapper = createWrapper();
		render(<NotebookEditor notebookId="nb-btn-disabled" />, { wrapper: Wrapper });

		// 再同期 effect が走り hasChanges=false になるのを待つ
		await act(async () => {
			await Promise.resolve();
		});

		const saveButton = screen.getByRole('button', { name: '更新' }) as HTMLButtonElement;
		expect(saveButton.disabled).toBe(true);
	});

	it('Ctrl+S で debounce タイマー満了を待たずに即時保存が実行される', async () => {
		const nb = buildNotebook({ id: 'nb-ctrl-s' });
		mockNotebookMap['nb-ctrl-s'] = nb;
		updateMutateAsync.mockResolvedValue(nb);

		const Wrapper = createWrapper();
		render(<NotebookEditor notebookId="nb-ctrl-s" />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'Ctrl+S Save' } });
		});

		// debounce タイマーを進めずに Ctrl+S を押す
		await act(async () => {
			fireEvent.keyDown(document, { key: 's', ctrlKey: true });
		});
		await act(async () => {
			await Promise.resolve();
		});

		// タイマー満了を待たなくても保存が実行される
		expect(updateMutateAsync).toHaveBeenCalledTimes(1);
	});

	it('Ctrl+S による明示保存後はタイマー満了時に二重保存が発生しない', async () => {
		const nb = buildNotebook({ id: 'nb-no-double' });
		mockNotebookMap['nb-no-double'] = nb;
		updateMutateAsync.mockResolvedValue(nb);

		const Wrapper = createWrapper();
		render(<NotebookEditor notebookId="nb-no-double" />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'No Double Save' } });
		});

		// Ctrl+S で即時保存（cancelDebounce も実行される）
		await act(async () => {
			fireEvent.keyDown(document, { key: 's', ctrlKey: true });
		});
		await act(async () => {
			await Promise.resolve();
		});

		// debounce 時間が経過しても追加保存は発生しない
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});

		expect(updateMutateAsync).toHaveBeenCalledTimes(1);
	});
});

describe('NotebookEditor - テーマ・タグ変更の自動保存対象化', () => {
	beforeEach(() => {
		cleanup();
		createMutateAsync.mockReset();
		updateMutateAsync.mockReset();
		mockGetNotebookTags.mockReset().mockResolvedValue([]);
		mockAssignTagsToNotebook.mockReset().mockResolvedValue({});
		mockUseTagQueries.mockReturnValue({ tagsQuery: { data: [] } });
		mockUseSystemThemes.mockReturnValue({ data: [], isLoading: false });
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		Object.keys(mockNotebookMap).forEach((k) => delete mockNotebookMap[k]);
	});

	it('テーマ変更が自動保存をトリガーし themeId がペイロードに含まれる', async () => {
		const nb = buildNotebook({ id: 'nb-theme' });
		mockNotebookMap['nb-theme'] = nb;
		updateMutateAsync.mockResolvedValue(nb);
		// テーマを option として DOM に追加するためモックに含める
		mockUseSystemThemes.mockReturnValue({
			data: [{ id: 'theme-id-1', name: 'Test Theme' }],
			isLoading: false,
		});

		const Wrapper = createWrapper();
		render(<NotebookEditor notebookId="nb-theme" />, { wrapper: Wrapper });

		const themeSelect = screen.getByRole('combobox') as HTMLSelectElement;
		await act(async () => {
			fireEvent.change(themeSelect, { target: { value: 'theme-id-1' } });
		});
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		await act(async () => {
			await Promise.resolve();
		});

		expect(updateMutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ themeId: 'theme-id-1' }),
			}),
		);
	});

	it('タグ変更後に本体保存成功 → assignTagsToNotebook が呼ばれる', async () => {
		const nb = buildNotebook({ id: 'nb-tag-assign' });
		mockNotebookMap['nb-tag-assign'] = nb;
		updateMutateAsync.mockResolvedValue(nb);
		mockUseTagQueries.mockReturnValue({
			tagsQuery: { data: [{ id: 'tag-1', name: 'Tag 1', color: '#ff0000' }] },
		});

		const Wrapper = createWrapper();
		render(<NotebookEditor notebookId="nb-tag-assign" />, { wrapper: Wrapper });

		// タグドロップダウンを開く
		const tagBtn = screen.getByRole('button', { name: 'タグを選択' });
		await act(async () => {
			fireEvent.click(tagBtn);
		});

		// タグを選択
		const tag1Btn = screen.getByRole('button', { name: /Tag 1/ });
		await act(async () => {
			fireEvent.click(tag1Btn);
		});

		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		await act(async () => {
			await Promise.resolve();
		});
		await act(async () => {
			await Promise.resolve();
		});

		expect(updateMutateAsync).toHaveBeenCalledTimes(1);
		expect(mockAssignTagsToNotebook).toHaveBeenCalledWith('nb-tag-assign', {
			tagIds: ['tag-1'],
		});
	});

	it('タグ反映 API 失敗時も本体保存結果は保持され保存状態が「保存済み」になる', async () => {
		const nb = buildNotebook({ id: 'nb-tag-fail' });
		mockNotebookMap['nb-tag-fail'] = nb;
		updateMutateAsync.mockResolvedValue(nb);
		mockAssignTagsToNotebook.mockRejectedValue(new Error('Tag API failed'));
		mockUseTagQueries.mockReturnValue({
			tagsQuery: { data: [{ id: 'tag-2', name: 'Tag 2', color: '#00ff00' }] },
		});

		const Wrapper = createWrapper();
		render(<NotebookEditor notebookId="nb-tag-fail" />, { wrapper: Wrapper });

		const tagBtn = screen.getByRole('button', { name: 'タグを選択' });
		await act(async () => {
			fireEvent.click(tagBtn);
		});
		const tag2Btn = screen.getByRole('button', { name: /Tag 2/ });
		await act(async () => {
			fireEvent.click(tag2Btn);
		});

		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		await act(async () => {
			await Promise.resolve();
		});
		await act(async () => {
			await Promise.resolve();
		});

		// 本体保存は実行された
		expect(updateMutateAsync).toHaveBeenCalledTimes(1);
		// タグ失敗でも保存状態は saved（エラーにならない）
		const statusLabel = screen.queryByTestId('notebook-save-status-label');
		expect(statusLabel?.textContent).toContain('保存済み');
	});
});

describe('NotebookEditor - 保存失敗時のエラー提示・入力保持・再試行', () => {
	beforeEach(() => {
		cleanup();
		createMutateAsync.mockReset();
		updateMutateAsync.mockReset();
		mockGetNotebookTags.mockReset().mockResolvedValue([]);
		mockAssignTagsToNotebook.mockReset().mockResolvedValue({});
		mockUseTagQueries.mockReturnValue({ tagsQuery: { data: [] } });
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		Object.keys(mockNotebookMap).forEach((k) => delete mockNotebookMap[k]);
	});

	it('自動保存がサーバーエラーで失敗したとき「保存失敗」インジケーターを表示する', async () => {
		const nb = buildNotebook({ id: 'nb-save-error' });
		mockNotebookMap['nb-save-error'] = nb;
		updateMutateAsync.mockRejectedValue(new Error('Server error'));

		const Wrapper = createWrapper();
		render(<NotebookEditor notebookId="nb-save-error" />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;
		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'Error Trigger' } });
		});
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		await act(async () => {
			await Promise.resolve();
		});

		const statusLabel = screen.queryByTestId('notebook-save-status-label');
		expect(statusLabel?.textContent).toContain('保存失敗');
	});

	it('保存失敗時にユーザーの入力（name）が保持される', async () => {
		const nb = buildNotebook({ id: 'nb-input-preserve' });
		mockNotebookMap['nb-input-preserve'] = nb;
		updateMutateAsync.mockRejectedValue(new Error('Server error'));

		const Wrapper = createWrapper();
		render(<NotebookEditor notebookId="nb-input-preserve" />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;
		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'Preserved Input' } });
		});
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		await act(async () => {
			await Promise.resolve();
		});

		// 保存失敗後も入力が保持される
		expect(nameInput.value).toBe('Preserved Input');
	});

	it('保存失敗後の再編集で自動保存が再トリガーされる', async () => {
		const nb = buildNotebook({ id: 'nb-retry' });
		mockNotebookMap['nb-retry'] = nb;
		updateMutateAsync.mockRejectedValueOnce(new Error('Server error')).mockResolvedValue(nb);

		const Wrapper = createWrapper();
		render(<NotebookEditor notebookId="nb-retry" />, { wrapper: Wrapper });

		const nameInput = screen.getByPlaceholderText('ノートブック名を入力') as HTMLInputElement;

		// 1回目の変更と保存（失敗）
		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'First Edit' } });
		});
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		await act(async () => {
			await Promise.resolve();
		});
		expect(updateMutateAsync).toHaveBeenCalledTimes(1);

		// 2回目の変更（エラー後の再編集 → 自動保存再試行）
		await act(async () => {
			fireEvent.change(nameInput, { target: { value: 'Second Edit' } });
		});
		await act(async () => {
			vi.advanceTimersByTime(DEBOUNCE_MS + 50);
		});
		await act(async () => {
			await Promise.resolve();
		});

		expect(updateMutateAsync).toHaveBeenCalledTimes(2);
	});
});

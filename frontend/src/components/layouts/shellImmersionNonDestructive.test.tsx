import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Memo } from '../../types/memo';

/*
 * shellImmersionNonDestructive.test.tsx — 玄関没入の非破壊性検証 / 振る舞い編（theme-immersive-world / Task 4.7）
 * =================================================================================================
 * 何を守るテストか:
 *   Task 4.1〜4.6 で玄関（ヘッダー・一覧・カード）を生 Tailwind からトークン＋プリミティブへ置換した。
 *   既存テスト（4.2〜4.5）は class/token が当たる「見た目」を守るが、本ファイルは没入適用が
 *   「振る舞い」を破壊しないことを守る:
 *     (a) ナビゲーション導線  — ヘッダーのナビクリックで既存の遷移ハンドラが発火し続ける
 *     (b) 各種ボタン動作      — カードクリック・新規メモボタンが発火し続ける
 *     (d) 認証フロー副作用なし — ログアウト/設定導線がトークン化後も温存される
 *   （画面遷移(c)・メモ編集ロジック(e) はルートレベルのため shellImmersionRouting.test.tsx で検証）
 *   _Requirements: 2.5, 7.4_
 */

const navMocks = {
	goToMemoList: vi.fn(),
	goToTags: vi.fn(),
	goToNotebookList: vi.fn(),
	goToTrash: vi.fn(),
	goToEdit: vi.fn(),
	goToMemoCreate: vi.fn(),
	goToNotebookCreate: vi.fn(),
};
const logoutMock = vi.fn();
const openFeedbackMock = vi.fn();

vi.mock('../../hooks/useNavigation', () => ({
	useNavigation: vi.fn(() => navMocks),
}));

vi.mock('../../stores/useViewStore', () => ({
	useViewStore: vi.fn(() => ({
		currentObject: 'memo',
		currentView: 'list',
		notebookFilter: 'ALL',
	})),
}));

vi.mock('../../contexts/AuthContext', () => ({
	useAuth: vi.fn(() => ({
		user: { name: 'Test User', email: 'test@example.com', role: 'USER' },
		logout: logoutMock,
	})),
}));

vi.mock('../../stores/useFeedbackStore', () => ({
	useFeedbackStore: vi.fn(() => openFeedbackMock),
}));

vi.mock('../ui/OfflineBadge', () => ({
	OfflineBadge: () => <div data-testid="offline-badge" />,
}));

vi.mock('../../hooks/useMemoQueries', () => ({
	useMemos: vi.fn(() => ({ data: [], isLoading: false, error: null })),
	useSearchMemos: vi.fn(() => ({ data: [], isLoading: false, error: null })),
	useTogglePin: vi.fn(() => ({ mutate: vi.fn() })),
}));

import { Header } from '../ui/Header';
import { MemoItem } from '../memo/MemoItem';
import { MemoList } from '../memo/MemoList';
import { useMemos, useSearchMemos, useTogglePin } from '../../hooks/useMemoQueries';

const mockMemo = {
	id: 'memo-1',
	title: 'テストメモ',
	content: '<p>本文</p>',
	notebookId: null,
	createdAt: '2026-06-28T00:00:00.000Z',
	updatedAt: '2026-06-28T00:00:00.000Z',
	memoTags: [],
	notebook: null,
} as unknown as Memo;

const renderHeader = () =>
	render(
		<MemoryRouter>
			<Header />
		</MemoryRouter>,
	);

beforeEach(() => {
	vi.clearAllMocks();
});

describe('Task 4.7 (a) ナビゲーション導線が没入後も温存される', () => {
	it('「メモ」ナビクリックで goToMemoList が発火する（トークン化後も onClick 配線が生きている）', () => {
		renderHeader();
		fireEvent.click(screen.getByText('メモ').closest('button')!);
		expect(navMocks.goToMemoList).toHaveBeenCalledTimes(1);
	});

	it('「ノートブック」ナビクリックで goToNotebookList が発火する', () => {
		renderHeader();
		fireEvent.click(screen.getByText('ノートブック').closest('button')!);
		expect(navMocks.goToNotebookList).toHaveBeenCalledTimes(1);
	});

	it('「タグ」「ゴミ箱」ナビクリックでそれぞれの遷移ハンドラが発火する', () => {
		renderHeader();
		fireEvent.click(screen.getByText('タグ').closest('button')!);
		fireEvent.click(screen.getByText('ゴミ箱').closest('button')!);
		expect(navMocks.goToTags).toHaveBeenCalledTimes(1);
		expect(navMocks.goToTrash).toHaveBeenCalledTimes(1);
	});
});

describe('Task 4.7 (b) 各種ボタン動作が没入後も温存される', () => {
	it('メモカード（.shell-card）クリックで onClick が発火する', () => {
		const onClick = vi.fn();
		render(<MemoItem memo={mockMemo} onClick={onClick} />);
		fireEvent.click(screen.getByTestId('memo-item'));
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it('一覧の「新規メモ」ボタン（.shell-button-primary）クリックで goToMemoCreate が発火する', () => {
		vi.mocked(useMemos).mockReturnValue({
			data: [mockMemo],
			isLoading: false,
			error: null,
		} as ReturnType<typeof useMemos>);
		vi.mocked(useSearchMemos).mockReturnValue({
			data: [],
			isLoading: false,
			error: null,
		} as ReturnType<typeof useSearchMemos>);

		render(<MemoList />);
		fireEvent.click(screen.getByText('新規メモ').closest('button')!);
		expect(navMocks.goToMemoCreate).toHaveBeenCalledTimes(1);
	});
});

describe('Task 4.7 (d) 認証フロー副作用なし', () => {
	const openDropdown = () => {
		renderHeader();
		// ユーザーイニシャルボタンでドロップダウンを開く
		fireEvent.click(screen.getByTitle('Test User'));
	};

	it('ドロップダウンの「ログアウト」で logout() が発火する', () => {
		openDropdown();
		fireEvent.click(screen.getByText('ログアウト'));
		expect(logoutMock).toHaveBeenCalledTimes(1);
	});

	it('「設定」導線がトークン化後も存在する（認証メニューが欠落しない）', () => {
		openDropdown();
		expect(screen.getByText('設定')).toBeTruthy();
	});
});

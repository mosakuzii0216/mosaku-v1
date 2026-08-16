import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

/*
 * Header.test.tsx — ヘッダーナビのトークン駆動化（theme-immersive-world / Task 4.2）
 * =============================================================================
 * 何を守るテストか:
 *   過去 mosaku-brand-theme Phase A で、ヘッダーの生 Tailwind 配色（text-gray-600 等）が
 *   要素型セレクタと競合してナビ文字が消失しロールバックした。本タスクはヘッダーを
 *   生 Tailwind 配色からトークン＋プリミティブ（.shell-surface / .shell-nav-item）へ
 *   置換する。よって本テストは「(a) 面とナビがプリミティブクラスで解決される、
 *   (b) ナビ文字/アイコンが背景に溶けず DOM に存在し続ける（3.2 再発防止）、
 *   (c) アクティブナビが選択層 is-active を示す（3.3）」を機械検証する。
 */

vi.mock('../../stores/useViewStore', () => ({
	useViewStore: vi.fn(() => ({ currentView: 'list', currentObject: 'memo' })),
}));

vi.mock('../../hooks/useNavigation', () => ({
	useNavigation: vi.fn(() => ({
		goToMemoList: vi.fn(),
		goToTags: vi.fn(),
		goToNotebookList: vi.fn(),
		goToTrash: vi.fn(),
	})),
}));

vi.mock('../../contexts/AuthContext', () => ({
	useAuth: vi.fn(() => ({
		user: { name: 'Test User', email: 'test@example.com', role: 'USER' },
		logout: vi.fn(),
	})),
}));

vi.mock('../../stores/useFeedbackStore', () => ({
	useFeedbackStore: vi.fn(() => vi.fn()),
}));

vi.mock('./OfflineBadge', () => ({
	OfflineBadge: () => <div data-testid="offline-badge" />,
}));

import { Header } from './Header';
import { useViewStore } from '../../stores/useViewStore';

const renderHeader = () =>
	render(
		<MemoryRouter>
			<Header />
		</MemoryRouter>,
	);

describe('Header — ヘッダーナビのトークン駆動化（4.2）', () => {
	beforeEach(() => {
		vi.mocked(useViewStore).mockReturnValue({
			currentView: 'list',
			currentObject: 'memo',
		} as ReturnType<typeof useViewStore>);
	});

	it('ヘッダー地は .shell-surface（トークン駆動）で塗られ、生 bg-white を持たない', () => {
		const { container } = renderHeader();
		const header = container.querySelector('header');
		expect(header?.classList.contains('shell-surface')).toBe(true);
		expect(header?.className).not.toMatch(/\bbg-white\b/);
	});

	it('ナビボタンは .shell-nav-item クラスでトークン駆動になる', () => {
		renderHeader();
		const memoNav = screen.getByText('メモ').closest('button');
		expect(memoNav?.classList.contains('shell-nav-item')).toBe(true);
	});

	it('アクティブなナビ（メモ一覧表示中）は is-active で選択層を示す（3.3）', () => {
		renderHeader();
		const memoNav = screen.getByText('メモ').closest('button');
		expect(memoNav?.classList.contains('is-active')).toBe(true);
	});

	it('非アクティブなナビは is-active を持たない', () => {
		renderHeader();
		const tagNav = screen.getByText('タグ').closest('button');
		expect(tagNav?.classList.contains('is-active')).toBe(false);
	});

	it('ナビ文字が背景に溶けて消失しない（過去ロールバック再発防止 / 3.2）', () => {
		renderHeader();
		expect(screen.getByText('メモ')).toBeTruthy();
		expect(screen.getByText('ノートブック')).toBeTruthy();
		expect(screen.getByText('タグ')).toBeTruthy();
		expect(screen.getByText('ゴミ箱')).toBeTruthy();
	});

	it('ナビボタンは生 Tailwind 配色（text-gray-600 / bg-blue-100）を直当てしない', () => {
		renderHeader();
		const memoNav = screen.getByText('メモ').closest('button');
		expect(memoNav?.className).not.toMatch(/text-gray-600|bg-blue-100|text-blue-800/);
	});
});

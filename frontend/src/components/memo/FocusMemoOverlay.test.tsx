import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

const mockCloseDisplayMode = vi.fn();
const mockIsDisplayMode = vi.fn(() => false);

vi.mock('../../stores/useViewStore', () => ({
	useViewStore: (
		selector: (s: { isDisplayMode: boolean; closeDisplayMode: () => void }) => unknown,
	) => selector({ isDisplayMode: mockIsDisplayMode(), closeDisplayMode: mockCloseDisplayMode }),
}));

const mockSelectedMemoId = vi.fn<() => string | null>(() => null);

vi.mock('../../stores/useMemoDataStore', () => ({
	useMemoDataStore: (selector: (s: { selectedMemoId: string | null }) => unknown) =>
		selector({ selectedMemoId: mockSelectedMemoId() }),
}));

const mockMemoData = vi.fn(() => ({ data: undefined }));

vi.mock('../../hooks/useMemoQueries', () => ({
	useMemo: (_id: string) => mockMemoData(),
}));

const mockActiveTheme = vi.fn(() => null);

vi.mock('../../hooks/useActiveTheme', () => ({
	useActiveTheme: () => mockActiveTheme(),
}));

vi.mock('../public/PublicMemoRenderer', () => ({
	PublicMemoRenderer: ({ content }: { content: string }) =>
		React.createElement('div', { 'data-testid': 'public-memo-renderer', 'data-content': content }),
}));

import { FocusMemoOverlay } from './FocusMemoOverlay';

describe('FocusMemoOverlay', () => {
	beforeEach(() => {
		mockCloseDisplayMode.mockClear();
		mockIsDisplayMode.mockReturnValue(false);
		mockSelectedMemoId.mockReturnValue(null);
		mockMemoData.mockReturnValue({ data: undefined });
		mockActiveTheme.mockReturnValue(null);
	});

	afterEach(() => {
		document.body.style.overflow = '';
	});

	describe('Task 2.1: 基本構造', () => {
		it('isDisplayMode=false のとき DOM に何も描画しない', () => {
			mockIsDisplayMode.mockReturnValue(false);
			const { container } = render(React.createElement(FocusMemoOverlay));
			expect(container.firstChild).toBeNull();
		});

		it('isDisplayMode=true のときオーバーレイを描画する', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テストメモ', content: '<p>本文</p>' },
			});
			render(React.createElement(FocusMemoOverlay));
			expect(document.querySelector('[data-testid="focus-memo-overlay"]')).toBeTruthy();
		});

		it('マウント時に body.overflow が hidden になる', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テストメモ', content: '<p>本文</p>' },
			});
			render(React.createElement(FocusMemoOverlay));
			expect(document.body.style.overflow).toBe('hidden');
		});
	});

	describe('Task 2.2: メモコンテンツ表示', () => {
		it('メモのタイトルを表示する', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テストタイトル', content: '<p>本文</p>' },
			});
			render(React.createElement(FocusMemoOverlay));
			expect(screen.getByText('テストタイトル')).toBeTruthy();
		});

		it('PublicMemoRenderer にコンテンツを渡す', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テストタイトル', content: '<p>本文テキスト</p>' },
			});
			render(React.createElement(FocusMemoOverlay));
			const renderer = document.querySelector('[data-testid="public-memo-renderer"]');
			expect(renderer?.getAttribute('data-content')).toBe('<p>本文テキスト</p>');
		});
	});

	describe('Task 2.3: 空状態・ローディング・エラーガード', () => {
		it('memo が undefined のときローディングメッセージを表示する', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({ data: undefined });
			render(React.createElement(FocusMemoOverlay));
			expect(document.querySelector('[data-testid="loading-message"]')).toBeTruthy();
		});

		it('selectedMemoId が null のとき closeDisplayMode を呼ぶ', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue(null);
			act(() => {
				render(React.createElement(FocusMemoOverlay));
			});
			expect(mockCloseDisplayMode).toHaveBeenCalledTimes(1);
		});

		it('content が空文字のとき空状態メッセージを表示する', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'タイトルのみ', content: '' },
			});
			render(React.createElement(FocusMemoOverlay));
			expect(document.querySelector('[data-testid="empty-content-message"]')).toBeTruthy();
		});
	});

	describe('Task 2.4: テーマ CSS 変数継承', () => {
		it('activeTheme が null のとき data-theme-id 属性なしで描画する', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テスト', content: '<p>本文</p>' },
			});
			mockActiveTheme.mockReturnValue(null);
			render(React.createElement(FocusMemoOverlay));
			const overlay = document.querySelector('[data-testid="focus-memo-overlay"]');
			expect(overlay?.hasAttribute('data-theme-id')).toBe(false);
		});

		it('activeTheme がある場合 data-theme-id 属性を付与する', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テスト', content: '<p>本文</p>' },
			});
			mockActiveTheme.mockReturnValue({
				id: 'theme-forest',
				name: 'Forest',
				styles: {},
				cssFilePath: '/themes/nature/forest.css',
				metadata: {},
			});
			render(React.createElement(FocusMemoOverlay));
			const overlay = document.querySelector('[data-testid="focus-memo-overlay"]');
			expect(overlay?.getAttribute('data-theme-id')).toBe('theme-forest');
		});
	});

	describe('Task 3 (一部): ESC キーと閉じるボタン', () => {
		it('ESC キー押下で closeDisplayMode を呼ぶ', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テスト', content: '<p>本文</p>' },
			});
			render(React.createElement(FocusMemoOverlay));
			fireEvent.keyDown(document, { key: 'Escape' });
			expect(mockCloseDisplayMode).toHaveBeenCalledTimes(1);
		});

		it('閉じるボタンクリックで closeDisplayMode を呼ぶ', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テスト', content: '<p>本文</p>' },
			});
			render(React.createElement(FocusMemoOverlay));
			const closeBtn = document.querySelector('[data-testid="close-button"]');
			if (closeBtn) fireEvent.click(closeBtn);
			expect(mockCloseDisplayMode).toHaveBeenCalledTimes(1);
		});

		it('背景クリックで closeDisplayMode を呼ぶ', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テスト', content: '<p>本文</p>' },
			});
			render(React.createElement(FocusMemoOverlay));
			const overlay = document.querySelector('[data-testid="focus-memo-overlay"]');
			if (overlay) fireEvent.click(overlay);
			expect(mockCloseDisplayMode).toHaveBeenCalledTimes(1);
		});
	});
});

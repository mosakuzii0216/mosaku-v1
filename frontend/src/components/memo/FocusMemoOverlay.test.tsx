import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import type { JSONContent } from '@tiptap/react';

// Memo.content は JSONContent（オブジェクト）。文字列モックだと空判定バグを取り逃すため、
// 実型どおりのドキュメントを組み立てる。
const doc = (text: string): JSONContent => ({
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const emptyDoc = (): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph' }] });

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
	PublicMemoRenderer: ({ content }: { content: JSONContent }) =>
		React.createElement('div', {
			'data-testid': 'public-memo-renderer',
			'data-content': JSON.stringify(content),
		}),
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
				data: { id: 'memo-1', title: 'テストメモ', content: doc('本文') },
			});
			render(React.createElement(FocusMemoOverlay));
			expect(document.querySelector('[data-testid="focus-memo-overlay"]')).toBeTruthy();
		});

		it('マウント時に body.overflow が hidden になる', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テストメモ', content: doc('本文') },
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
				data: { id: 'memo-1', title: 'テストタイトル', content: doc('本文') },
			});
			render(React.createElement(FocusMemoOverlay));
			expect(screen.getByText('テストタイトル')).toBeTruthy();
		});

		it('PublicMemoRenderer にコンテンツを渡す', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テストタイトル', content: doc('本文テキスト') },
			});
			render(React.createElement(FocusMemoOverlay));
			const renderer = document.querySelector('[data-testid="public-memo-renderer"]');
			expect(renderer?.getAttribute('data-content')).toBe(JSON.stringify(doc('本文テキスト')));
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

		it('content が空ドキュメント（段落のみ）のとき空状態メッセージを表示する', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'タイトルのみ', content: emptyDoc() },
			});
			render(React.createElement(FocusMemoOverlay));
			expect(document.querySelector('[data-testid="empty-content-message"]')).toBeTruthy();
			expect(document.querySelector('[data-testid="public-memo-renderer"]')).toBeNull();
		});

		it('content に本文があるとき空状態メッセージを表示しない', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'タイトル', content: doc('本文あり') },
			});
			render(React.createElement(FocusMemoOverlay));
			expect(document.querySelector('[data-testid="empty-content-message"]')).toBeNull();
			expect(document.querySelector('[data-testid="public-memo-renderer"]')).toBeTruthy();
		});
	});

	describe('Task 2.4: テーマ CSS 変数継承', () => {
		it('activeTheme が null のとき data-theme-id 属性なしで描画する', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テスト', content: doc('本文') },
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
				data: { id: 'memo-1', title: 'テスト', content: doc('本文') },
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

	describe('アクセシビリティ: モーダルの作法', () => {
		const renderOpen = () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テストタイトル', content: doc('本文') },
			});
			return render(React.createElement(FocusMemoOverlay));
		};

		it('role="dialog" / aria-modal / メモタイトル入りの aria-label を持つ', () => {
			renderOpen();
			const overlay = document.querySelector('[data-testid="focus-memo-overlay"]');
			expect(overlay?.getAttribute('role')).toBe('dialog');
			expect(overlay?.getAttribute('aria-modal')).toBe('true');
			expect(overlay?.getAttribute('aria-label')).toBe('表示モード: テストタイトル');
		});

		it('起動中は #root に inert が付き、閉じると外れる', () => {
			const appRoot = document.createElement('div');
			appRoot.id = 'root';
			document.body.appendChild(appRoot);

			const { unmount } = renderOpen();
			expect(appRoot.hasAttribute('inert')).toBe(true);

			unmount();
			expect(appRoot.hasAttribute('inert')).toBe(false);

			appRoot.remove();
		});

		it('起動時にオーバーレイへフォーカスを移し、閉じたら起動元へ戻す', () => {
			const trigger = document.createElement('button');
			document.body.appendChild(trigger);
			trigger.focus();
			expect(document.activeElement).toBe(trigger);

			const { unmount } = renderOpen();
			expect(document.activeElement).toBe(
				document.querySelector('[data-testid="focus-memo-overlay"]'),
			);

			unmount();
			expect(document.activeElement).toBe(trigger);

			trigger.remove();
		});
	});

	describe('Task 3 (一部): ESC キーと閉じるボタン', () => {
		it('ESC キー押下で closeDisplayMode を呼ぶ', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テスト', content: doc('本文') },
			});
			render(React.createElement(FocusMemoOverlay));
			fireEvent.keyDown(document, { key: 'Escape' });
			expect(mockCloseDisplayMode).toHaveBeenCalledTimes(1);
		});

		it('閉じるボタンクリックで closeDisplayMode を呼ぶ', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テスト', content: doc('本文') },
			});
			render(React.createElement(FocusMemoOverlay));
			const closeBtn = document.querySelector('[data-testid="close-button"]');
			if (closeBtn) fireEvent.click(closeBtn);
			expect(mockCloseDisplayMode).toHaveBeenCalledTimes(1);
		});

		it('背景の押下→クリックで closeDisplayMode を呼ぶ', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テスト', content: doc('本文') },
			});
			render(React.createElement(FocusMemoOverlay));
			const overlay = document.querySelector('[data-testid="focus-memo-overlay"]');
			if (overlay) {
				fireEvent.mouseDown(overlay);
				fireEvent.click(overlay);
			}
			expect(mockCloseDisplayMode).toHaveBeenCalledTimes(1);
		});

		it('本文で押下し背景で離した（ドラッグ選択）ときは閉じない', () => {
			mockIsDisplayMode.mockReturnValue(true);
			mockSelectedMemoId.mockReturnValue('memo-1');
			mockMemoData.mockReturnValue({
				data: { id: 'memo-1', title: 'テスト', content: doc('本文') },
			});
			render(React.createElement(FocusMemoOverlay));
			const overlay = document.querySelector('[data-testid="focus-memo-overlay"]');
			const title = document.querySelector('[data-testid="memo-title"]');
			if (overlay && title) {
				// 押下は本文側 → バブリングでオーバーレイの onMouseDown に届く
				fireEvent.mouseDown(title);
				// click は共通祖先（オーバーレイ）で発火する
				fireEvent.click(overlay);
			}
			expect(mockCloseDisplayMode).not.toHaveBeenCalled();
		});
	});
});

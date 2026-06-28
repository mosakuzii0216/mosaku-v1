import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Memo } from '../../types/memo';

/*
 * MemoItem.test.tsx — メモカードの奥行き化（theme-immersive-world / Task 4.4）
 * ========================================================================
 * 何を守るテストか:
 *   メモカードは素の Tailwind カード（bg-white border hover:shadow-md）から、
 *   プリミティブ .shell-card（surface＋エレベーション＋マイクロインタラクション）へ置換する。
 *   よって「(a) カードが .shell-card で奥行きを得る、(b) 生 Tailwind 配色を直当てしない、
 *   (c) タイトル/プレビューが on-surface 系で解決し消失しない」を機械検証する（1.2, 4.1, 4.2, 4.5）。
 */

import { MemoItem } from './MemoItem';

const mockMemo = {
	id: '1',
	title: 'テストメモ',
	content: '<p>本文プレビュー</p>',
	notebookId: null,
	createdAt: '2026-06-28T00:00:00.000Z',
	updatedAt: '2026-06-28T00:00:00.000Z',
	memoTags: [],
	notebook: null,
} as unknown as Memo;

describe('MemoItem — メモカードの奥行き化（4.4）', () => {
	it('カードは .shell-card（surface＋elevation＋micro-interaction）になる', () => {
		render(<MemoItem memo={mockMemo} onClick={vi.fn()} />);
		const card = screen.getByTestId('memo-item');
		expect(card.classList.contains('shell-card')).toBe(true);
	});

	it('カードは生 Tailwind 配色（bg-white / border-gray-200）を直当てしない', () => {
		render(<MemoItem memo={mockMemo} onClick={vi.fn()} />);
		const card = screen.getByTestId('memo-item');
		expect(card.className).not.toMatch(/bg-white|border-gray-200/);
	});

	it('タイトルは on-surface トークンで解決し消失しない', () => {
		render(<MemoItem memo={mockMemo} onClick={vi.fn()} />);
		const title = screen.getByText('テストメモ');
		expect(title.className).toMatch(/var\(--on-surface\)/);
	});

	it('本文プレビューが表示される（補助テキストが消えない）', () => {
		render(<MemoItem memo={mockMemo} onClick={vi.fn()} />);
		expect(screen.getByText('本文プレビュー')).toBeTruthy();
	});
});

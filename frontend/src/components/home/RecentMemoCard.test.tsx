import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RecentMemoDto } from '../../types/dashboard';

/*
 * RecentMemoCard.test.tsx — 直近メモカードのトークン駆動化（theme-immersive-world / Task 4.5）
 * =====================================================================================
 * 何を守るテストか:
 *   ホームの直近メモカードを素の Tailwind カード（bg-white border hover:shadow-sm）から
 *   プリミティブ .shell-card（surface＋エレベーション）へ置換し、玄関〜本文の質感を連続させる。
 *   「(a) カードが .shell-card になる、(b) 生 Tailwind 配色を直当てしない、(c) タイトルが
 *   on-surface で消失しない」を機械検証する（1.2, 4.1, 5.2）。
 */

import { RecentMemoCard } from './RecentMemoCard';

const mockMemo = {
	id: '1',
	title: 'テストメモ',
	contentPreview: 'プレビュー',
	updatedAt: '2026-06-28T00:00:00.000Z',
} as unknown as RecentMemoDto;

describe('RecentMemoCard — 直近メモカードのトークン駆動化（4.5）', () => {
	it('カードは .shell-card（surface＋elevation）で奥行きを得る', () => {
		render(<RecentMemoCard memo={mockMemo} onClick={vi.fn()} />);
		const card = screen.getByText('テストメモ').closest('button');
		expect(card?.classList.contains('shell-card')).toBe(true);
	});

	it('カードは生 Tailwind 配色（bg-white / border-gray-200）を直当てしない', () => {
		render(<RecentMemoCard memo={mockMemo} onClick={vi.fn()} />);
		const card = screen.getByText('テストメモ').closest('button');
		expect(card?.className).not.toMatch(/bg-white|border-gray-200/);
	});

	it('タイトルは on-surface トークンで解決し消失しない', () => {
		render(<RecentMemoCard memo={mockMemo} onClick={vi.fn()} />);
		const title = screen.getByText('テストメモ');
		expect(title.className).toMatch(/var\(--on-surface\)/);
	});
});

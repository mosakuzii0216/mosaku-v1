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
import { MS_PER_DAY } from '../../utils/jstDate';

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

describe('RecentMemoCard — 更新日時の相対表示', () => {
	const renderWithUpdatedAt = (updatedAt: string) => {
		const memo = { ...mockMemo, updatedAt } as unknown as RecentMemoDto;
		render(<RecentMemoCard memo={memo} onClick={vi.fn()} />);
	};

	const daysAgo = (days: number) => new Date(Date.now() - days * MS_PER_DAY - 1000).toISOString();

	it('当日の更新は「今日」と表示する', () => {
		renderWithUpdatedAt(daysAgo(0));
		expect(screen.getByText('今日')).toBeTruthy();
	});

	it('1 日前の更新は「昨日」と表示する', () => {
		renderWithUpdatedAt(daysAgo(1));
		expect(screen.getByText('昨日')).toBeTruthy();
	});

	it('7 日未満は「N日前」と表示する', () => {
		renderWithUpdatedAt(daysAgo(6));
		expect(screen.getByText('6日前')).toBeTruthy();
	});

	it('7 日以上は相対表示をやめて日付を表示する', () => {
		const updatedAt = daysAgo(7);
		renderWithUpdatedAt(updatedAt);
		const expected = new Date(updatedAt).toLocaleDateString('ja-JP', {
			month: 'short',
			day: 'numeric',
		});
		expect(screen.getByText(expected)).toBeTruthy();
	});
});

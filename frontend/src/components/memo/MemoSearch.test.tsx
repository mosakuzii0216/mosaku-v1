import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/*
 * MemoSearch.test.tsx — メモ検索の入力面のトークン駆動化（editor-surface-tokenization / Task 6.4）
 * ================================================================================================
 * 何を守るテストか:
 *   MemoSearch は既存ユニットテストが存在しないままトークン化される二次対象のため、
 *   本タスク内で回帰ガードを新規作成する（Risks #1）。
 *   (a) 入力が .shell-field 1本に集約される、(b) アイコンが低強調トークンを参照する、
 *   (c) コンテナ境界がトークン境界を参照する、(d) 生 Tailwind 配色を持たない、を機械検証する。
 */

vi.mock('../../stores/useViewStore', () => ({
	useViewStore: vi.fn(() => ({ searchQuery: '', setSearchQuery: vi.fn() })),
}));

vi.mock('../../hooks/useMemoQueries', () => ({
	useSearchMemos: vi.fn(() => ({ data: [] })),
}));

import { MemoSearch } from './MemoSearch';

describe('MemoSearch — トークン駆動化（6.4）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('入力は .shell-field 1本へ集約される', () => {
		render(<MemoSearch />);
		const input = screen.getByPlaceholderText('検索');
		expect(input.classList.contains('shell-field')).toBe(true);
	});

	it('入力は生 Tailwind 配色（bg-white / text-gray-900 / border-gray-300 等）を持たない', () => {
		render(<MemoSearch />);
		const input = screen.getByPlaceholderText('検索');
		expect(input.className).not.toMatch(
			/bg-white|text-gray-900|border-gray-300|placeholder-gray-500|focus:ring-blue-500|focus:border-blue-500/,
		);
	});

	it('コンテナ境界はトークン境界（var(--outline)）を参照する', () => {
		const { container } = render(<MemoSearch />);
		const wrapper = container.firstChild as HTMLElement;
		expect(wrapper.className).toMatch(/var\(--outline\)/);
		expect(wrapper.className).not.toMatch(/border-gray-200/);
	});

	it('検索アイコンは低強調トークン（--on-surface-variant）を参照し、生 text-gray-400 を持たない', () => {
		const { container } = render(<MemoSearch />);
		const icon = container.querySelector('svg');
		expect(icon?.className.baseVal).toMatch(/var\(--on-surface-variant\)/);
		expect(icon?.className.baseVal).not.toMatch(/text-gray-400/);
	});
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/*
 * MemoPalette.test.tsx — メモパレットのトークン駆動化（editor-surface-tokenization / Task 6.1）
 * =============================================================================================
 * 何を守るテストか:
 *   MemoPalette は既存ユニットテストが存在しないままトークン化される二次対象のため、
 *   本タスク内で回帰ガードを新規作成する（Risks #1）。
 *   (a) 暗幕/パネル/検索入力/フッターがプリミティブクラスで解決される、
 *   (b) 生 Tailwind 配色（bg-black / bg-white / bg-blue-50 等）を直当てしない、
 *   (c) 候補行がリストボックス/選択肢ロールと aria-selected をセットで持つ（3.3, 6.4）、
 *   を機械検証する。
 */

vi.mock('../../hooks/useNotebookQueries', () => ({
	useNotebooks: vi.fn(() => ({ data: [{ id: 'nb-1', name: 'ノート1' }] })),
}));

vi.mock('../../hooks/useMemoQueries', () => ({
	useMemos: vi.fn(() => ({
		data: [
			{
				id: 'memo-1',
				title: 'テストメモ',
				content: { type: 'doc', content: [] },
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				trashedAt: null,
			},
		],
	})),
}));

vi.mock('../../stores/usePaletteStore', () => ({
	usePaletteStore: vi.fn(() => ({ paletteNotebookFilter: null })),
}));

vi.mock('../../hooks/useNavigation', () => ({
	useNavigation: vi.fn(() => ({ goToEdit: vi.fn() })),
}));

vi.mock('../../utils/logger', () => ({
	logger: { debug: vi.fn() },
}));

import { MemoPalette } from './MemoPalette';

const renderPalette = () =>
	render(<MemoPalette isOpen onClose={vi.fn()} initialMode="memo-select" />);

describe('MemoPalette — トークン駆動化（6.1）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Element.prototype.scrollIntoView = vi.fn();
	});

	it('暗幕は .shell-scrim で塗られ、生 bg-black を持たない', () => {
		const { container } = renderPalette();
		const scrim = container.querySelector('.shell-scrim');
		expect(scrim).toBeTruthy();
		expect(scrim?.className).not.toMatch(/bg-black|bg-opacity-50/);
	});

	it('パネル本体は .shell-popover で塗られ、生 bg-white を持たない', () => {
		const { container } = renderPalette();
		const panel = container.querySelector('.shell-popover');
		expect(panel).toBeTruthy();
		expect(panel?.className).not.toMatch(/bg-white/);
	});

	it('検索入力は .shell-field を持つ', () => {
		renderPalette();
		const input = screen.getByPlaceholderText('メモを検索... (タイトル、内容)');
		expect(input.classList.contains('shell-field')).toBe(true);
	});

	it('メモ行のリストラッパーは role="listbox" を持つ', () => {
		renderPalette();
		expect(screen.getByRole('listbox')).toBeTruthy();
	});

	it('選択中のメモ行は role="option" と aria-selected="true" をセットで持つ（3.3, 6.4）', () => {
		renderPalette();
		const option = screen.getByRole('option', { name: /テストメモ/ });
		expect(option.getAttribute('aria-selected')).toBe('true');
		expect(option.classList.contains('shell-popover-item')).toBe(true);
	});

	it('フッターの kbd は生 bg-white を直当てしない', () => {
		const { container } = renderPalette();
		const kbd = container.querySelector('kbd');
		expect(kbd?.className).not.toMatch(/bg-white/);
	});

	it('パネル配下に生 Tailwind 配色（bg-blue-50 / text-gray-900 / border-gray-200）が残存しない', () => {
		const { container } = renderPalette();
		expect(container.innerHTML).not.toMatch(
			/bg-blue-50|text-gray-900|border-gray-200|bg-gray-50|text-gray-500|text-gray-400|text-gray-600/,
		);
	});
});

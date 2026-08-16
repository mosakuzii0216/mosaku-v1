import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/*
 * ShellThemeSelector.test.tsx — シェルテーマセレクタ（theme-immersive-world / Task 4.6）
 * ================================================================================
 * 何を守るテストか:
 *   「テーマ管理（未実装）」プレースホルダを、システムテーマ一覧からシェル床を選択・適用する
 *   最小セレクタへ置換する。よって「(a) システムテーマ一覧を表示、(b) 選択で
 *   setShellTheme({id, slug}) を呼ぶ、(c) 解除で setShellTheme(null)、(d) 現在の選択を
 *   aria-pressed で示す」を機械検証する（2.1）。フルギャラリーは非スコープ。
 */

const mockSetShellTheme = vi.fn();

vi.mock('../../hooks/useThemeQueries', () => ({
	useThemes: vi.fn(),
}));

vi.mock('../../stores/useShellThemeStore', () => ({
	useShellThemeStore: vi.fn(),
}));

import { useThemes } from '../../hooks/useThemeQueries';
import { useShellThemeStore } from '../../stores/useShellThemeStore';
import { ShellThemeSelector } from './ShellThemeSelector';

const moriTheme = {
	id: 'theme-mori',
	name: '森',
	description: '深い森の世界',
	isSystem: true,
	metadata: { effectKey: 'mori' },
};

type ShellState = {
	selection: { id: string; slug: string } | null;
	setShellTheme: typeof mockSetShellTheme;
};

const mockStore = (selection: ShellState['selection']) => {
	vi.mocked(useShellThemeStore).mockImplementation((selector: (s: ShellState) => unknown) =>
		selector({ selection, setShellTheme: mockSetShellTheme }),
	);
};

describe('ShellThemeSelector — シェルテーマセレクタ（4.6）', () => {
	beforeEach(() => {
		mockSetShellTheme.mockClear();
		vi.mocked(useThemes).mockReturnValue({
			data: [moriTheme],
			isLoading: false,
		} as unknown as ReturnType<typeof useThemes>);
		mockStore(null);
	});

	it('システムテーマ一覧を表示する', () => {
		render(<ShellThemeSelector />);
		expect(screen.getByText('森')).toBeTruthy();
	});

	it('テーマをクリックすると setShellTheme({ id, slug }) を呼ぶ（シェル床を適用）', () => {
		render(<ShellThemeSelector />);
		fireEvent.click(screen.getByText('森'));
		expect(mockSetShellTheme).toHaveBeenCalledWith({ id: 'theme-mori', slug: 'mori' });
	});

	it('「なし」を選ぶと setShellTheme(null) でシェル床を解除する', () => {
		render(<ShellThemeSelector />);
		fireEvent.click(screen.getByText(/なし/));
		expect(mockSetShellTheme).toHaveBeenCalledWith(null);
	});

	it('現在選択中のテーマは aria-pressed=true で示される', () => {
		mockStore({ id: 'theme-mori', slug: 'mori' });
		render(<ShellThemeSelector />);
		const moriBtn = screen.getByText('森').closest('button');
		expect(moriBtn?.getAttribute('aria-pressed')).toBe('true');
	});
});

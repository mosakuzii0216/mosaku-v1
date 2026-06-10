import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../../hooks/useActiveTheme', () => ({
	useActiveTheme: vi.fn(() => null),
}));

vi.mock('../../hooks/useThemeCSS', () => ({
	useThemeCSS: vi.fn(),
}));

vi.mock('../../stores/useViewStore', () => ({
	useViewStore: vi.fn(() => ({
		currentObject: 'memo',
		currentView: 'list',
		isMobile: true,
		setIsMobile: vi.fn(),
	})),
}));

vi.mock('../../stores/useMemoDataStore', () => ({
	useMemoDataStore: vi.fn(() => ({
		selectedMemoId: null,
		selectedNotebookId: null,
	})),
}));

vi.mock('../../stores/usePaletteStore', () => ({
	usePaletteStore: vi.fn(() => ({
		paletteOpen: false,
		paletteMode: 'memo-select',
		closeMemoPalette: vi.fn(),
		openMemoPalette: vi.fn(),
	})),
}));

vi.mock('../../hooks/useNavigation', () => ({
	useNavigation: vi.fn(() => ({
		goToMemoCreate: vi.fn(),
		goToNotebookCreate: vi.fn(),
	})),
}));

vi.mock('../../hooks/useMemoQueries', () => ({
	useMemo: vi.fn(() => ({ data: undefined })),
}));

vi.mock('../../hooks/useAppInit', () => ({
	useAppInit: vi.fn(),
}));

vi.mock('../ui/Header', () => ({
	Header: () => <div data-testid="header">Header</div>,
}));

vi.mock('../memo/MemoList', () => ({
	MemoList: () => <div data-testid="memo-list">MemoList</div>,
}));

vi.mock('../memo/MemoEditor', () => ({
	MemoEditor: () => <div>MemoEditor</div>,
}));

vi.mock('../memo/TrashView', () => ({
	TrashView: () => <div>TrashView</div>,
}));

vi.mock('../tag/TagManager', () => ({
	TagManager: () => <div>TagManager</div>,
}));

vi.mock('../notebook/NotebookEditor', () => ({
	NotebookEditor: () => <div>NotebookEditor</div>,
}));

vi.mock('../notebook/NotebookList', () => ({
	NotebookList: () => <div>NotebookList</div>,
}));

vi.mock('../memo/MemoPalette', () => ({
	MemoPalette: () => null,
}));

vi.mock('../home/HomeDashboard', () => ({
	HomeDashboard: () => <div data-testid="home-dashboard">HomeDashboard</div>,
}));

vi.mock('../effects/ThemeEffectHost', () => ({
	ThemeEffectHost: vi.fn(({ theme }: { theme: unknown }) =>
		theme ? <div data-testid="theme-effect-host">ThemeEffectHost</div> : null,
	),
}));

import { useActiveTheme } from '../../hooks/useActiveTheme';
import { useThemeCSS } from '../../hooks/useThemeCSS';
import { ThemeEffectHost } from '../effects/ThemeEffectHost';
import { useViewStore } from '../../stores/useViewStore';
import { MobileLayout } from './MobileLayout';

const mockTheme = {
	id: 'theme-mori',
	name: 'mori',
	cssFilePath: 'mori/mori.css',
	styles: undefined,
};

describe('MobileLayout - ホーム画面ルーティング', () => {
	beforeEach(() => {
		vi.mocked(useActiveTheme).mockReturnValue(null);
		vi.mocked(useThemeCSS).mockReturnValue(undefined);
	});

	it('currentObject が "home" のとき HomeDashboard をレンダリングする', () => {
		vi.mocked(useViewStore).mockReturnValue({
			currentObject: 'home',
			currentView: 'list',
			isMobile: true,
			setIsMobile: vi.fn(),
		} as ReturnType<typeof useViewStore>);
		const { getByTestId } = render(<MobileLayout />);
		expect(getByTestId('home-dashboard')).toBeTruthy();
	});
});

describe('MobileLayout テーマルート適用', () => {
	beforeEach(() => {
		vi.mocked(useActiveTheme).mockReturnValue(null);
		vi.mocked(useThemeCSS).mockReturnValue(undefined);
	});

	it('アクティブテーマが null の場合、theme-root クラスが付与されない', () => {
		vi.mocked(useActiveTheme).mockReturnValue(null);
		const { container } = render(<MobileLayout />);
		const root = container.firstChild as HTMLElement;
		expect(root.classList.contains('theme-root')).toBe(false);
		expect(root.dataset.themeId).toBeUndefined();
	});

	it('アクティブテーマが存在する場合、theme-root クラスと data-theme-id が付与される', () => {
		vi.mocked(useActiveTheme).mockReturnValue(mockTheme);
		const { container } = render(<MobileLayout />);
		const root = container.firstChild as HTMLElement;
		expect(root.classList.contains('theme-root')).toBe(true);
		expect(root.dataset.themeId).toBe('theme-mori');
	});

	it('useThemeCSS がアクティブテーマで呼び出される', () => {
		vi.mocked(useActiveTheme).mockReturnValue(mockTheme);
		render(<MobileLayout />);
		expect(useThemeCSS).toHaveBeenCalledWith(mockTheme);
	});

	it('useThemeCSS が null テーマで呼び出される', () => {
		vi.mocked(useActiveTheme).mockReturnValue(null);
		render(<MobileLayout />);
		expect(useThemeCSS).toHaveBeenCalledWith(null);
	});

	it('ThemeEffectHost がアクティブテーマを props として受け取る', () => {
		vi.mocked(useActiveTheme).mockReturnValue(mockTheme);
		render(<MobileLayout />);
		expect(
			vi.mocked(ThemeEffectHost).mock.calls[vi.mocked(ThemeEffectHost).mock.calls.length - 1]?.[0],
		).toEqual(expect.objectContaining({ theme: mockTheme }));
	});

	it('ThemeEffectHost が null テーマで呼び出される', () => {
		vi.mocked(useActiveTheme).mockReturnValue(null);
		render(<MobileLayout />);
		expect(
			vi.mocked(ThemeEffectHost).mock.calls[vi.mocked(ThemeEffectHost).mock.calls.length - 1]?.[0],
		).toEqual(expect.objectContaining({ theme: null }));
	});

	it('非 mori テーマ時に ThemeEffectHost が DOM に何も追加しない', () => {
		vi.mocked(useActiveTheme).mockReturnValue(null);
		const { queryByTestId } = render(<MobileLayout />);
		expect(queryByTestId('theme-effect-host')).toBeNull();
	});

	it('mori テーマ時に ThemeEffectHost が DOM に表示される', () => {
		vi.mocked(useActiveTheme).mockReturnValue(mockTheme);
		const { getByTestId } = render(<MobileLayout />);
		expect(getByTestId('theme-effect-host')).toBeTruthy();
	});
});

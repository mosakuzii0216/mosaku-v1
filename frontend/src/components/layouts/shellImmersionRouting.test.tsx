import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { Memo } from '../../types/memo';

/*
 * shellImmersionRouting.test.tsx — 玄関没入の非破壊性検証 / 画面遷移編（theme-immersive-world / Task 4.7）
 * =================================================================================================
 * 何を守るテストか:
 *   Task 4.1 でレイアウトルートを app-shell 面化し data-theme を付与した。本ファイルは
 *   「没入適用が画面遷移・メモ編集導線を破壊しない」ことを守る:
 *     (c) 画面遷移            — currentObject/currentView の解決が没入(data-theme=mori)有無で不変
 *     (e) メモ編集ロジック副作用なし — edit/create ビューが選択メモ/isCreate を MemoEditor へ渡す導線を温存
 *   _Requirements: 2.5, 7.4_
 */

vi.mock('../../hooks/useActiveTheme', () => ({
	useActiveTheme: vi.fn(() => null),
}));
vi.mock('../../hooks/useThemeCSS', () => ({ useThemeCSS: vi.fn() }));
vi.mock('../../stores/useViewStore', () => ({
	useViewStore: vi.fn(() => ({ currentObject: 'memo', currentView: 'list' })),
}));
vi.mock('../../stores/useMemoDataStore', () => ({
	useMemoDataStore: vi.fn(() => ({ selectedMemoId: null, selectedNotebookId: null })),
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
	useNavigation: vi.fn(() => ({ goToMemoCreate: vi.fn(), goToNotebookCreate: vi.fn() })),
}));
vi.mock('../../hooks/useMemoQueries', () => ({
	useMemo: vi.fn(() => ({ data: undefined })),
}));
vi.mock('../../hooks/useAppInit', () => ({ useAppInit: vi.fn() }));
vi.mock('../../hooks/useReconnectSync', () => ({ useReconnectSync: vi.fn() }));

vi.mock('../ui/Header', () => ({ Header: () => <div data-testid="header">Header</div> }));
vi.mock('../memo/MemoList', () => ({
	MemoList: () => <div data-testid="memo-list">MemoList</div>,
}));
vi.mock('../memo/MemoEditor', () => ({
	MemoEditor: ({ memo, isCreate }: { memo?: Memo; isCreate?: boolean }) => (
		<div data-testid="memo-editor" data-memo-id={memo?.id} data-create={String(!!isCreate)}>
			MemoEditor
		</div>
	),
}));
vi.mock('../memo/TrashView', () => ({
	TrashView: () => <div data-testid="trash-view">TrashView</div>,
}));
vi.mock('../tag/TagManager', () => ({
	TagManager: () => <div data-testid="tag-manager">TagManager</div>,
}));
vi.mock('../notebook/NotebookEditor', () => ({ NotebookEditor: () => <div>NotebookEditor</div> }));
vi.mock('../notebook/NotebookList', () => ({
	NotebookList: () => <div data-testid="notebook-list">NotebookList</div>,
}));
vi.mock('../memo/MemoPalette', () => ({ MemoPalette: () => null }));
vi.mock('../memo/FocusMemoOverlay', () => ({ FocusMemoOverlay: () => null }));
vi.mock('../home/HomeDashboard', () => ({
	HomeDashboard: () => <div data-testid="home-dashboard">HomeDashboard</div>,
}));
vi.mock('../theme/ShellThemeSelector', () => ({
	ShellThemeSelector: () => <div data-testid="shell-theme-selector">ShellThemeSelector</div>,
}));
vi.mock('../effects/ThemeEffectHost', () => ({ ThemeEffectHost: () => null }));

import { DesktopLayout } from './DesktopLayout';
import { useActiveTheme } from '../../hooks/useActiveTheme';
import { useViewStore } from '../../stores/useViewStore';
import { useMemoDataStore } from '../../stores/useMemoDataStore';
import { useMemo as useMemoQuery } from '../../hooks/useMemoQueries';

const mockTheme = {
	id: 'theme-mori',
	name: 'mori',
	cssFilePath: 'mori/mori.css',
	styles: undefined,
	metadata: { effectKey: 'mori' as const },
};

const mockMemo = {
	id: 'memo-1',
	title: 'テストメモ',
	content: '<p>本文</p>',
} as unknown as Memo;

const setView = (currentObject: string, currentView: string) =>
	vi.mocked(useViewStore).mockReturnValue({
		currentObject,
		currentView,
	} as ReturnType<typeof useViewStore>);

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(useActiveTheme).mockReturnValue(null);
	setView('memo', 'list');
});

describe('Task 4.7 (c) 画面遷移が没入(data-theme=mori)有無で不変', () => {
	const cases: Array<{ object: string; view: string; testid: string }> = [
		{ object: 'home', view: 'list', testid: 'home-dashboard' },
		{ object: 'memo', view: 'list', testid: 'memo-list' },
		{ object: 'memo', view: 'trash', testid: 'trash-view' },
		{ object: 'notebook', view: 'list', testid: 'notebook-list' },
		{ object: 'tag', view: 'list', testid: 'tag-manager' },
		{ object: 'theme', view: 'list', testid: 'shell-theme-selector' },
	];

	for (const { object, view, testid } of cases) {
		it(`currentObject="${object}"/view="${view}" は没入有無に関わらず同じ画面(${testid})を描画する`, () => {
			setView(object, view);

			// 中立既定（非没入）
			vi.mocked(useActiveTheme).mockReturnValue(null);
			const neutral = render(<DesktopLayout />);
			expect(neutral.getByTestId(testid)).toBeTruthy();
			expect((neutral.container.firstChild as HTMLElement).dataset.theme).toBeUndefined();
			neutral.unmount();

			// 森没入
			vi.mocked(useActiveTheme).mockReturnValue(mockTheme);
			const immersive = render(<DesktopLayout />);
			const root = immersive.container.firstChild as HTMLElement;
			expect(root.dataset.theme).toBe('mori'); // 没入が適用されている
			expect(immersive.getByTestId(testid)).toBeTruthy(); // それでも同じ画面
		});
	}
});

describe('Task 4.7 (e) メモ編集ロジック副作用なし', () => {
	it('edit ビューは選択メモを MemoEditor へ渡す（没入下でも編集導線が温存）', () => {
		setView('memo', 'edit');
		vi.mocked(useMemoDataStore).mockReturnValue({
			selectedMemoId: 'memo-1',
			selectedNotebookId: null,
		} as ReturnType<typeof useMemoDataStore>);
		vi.mocked(useMemoQuery).mockReturnValue({
			data: mockMemo,
		} as ReturnType<typeof useMemoQuery>);
		vi.mocked(useActiveTheme).mockReturnValue(mockTheme);

		const { getByTestId } = render(<DesktopLayout />);
		const editor = getByTestId('memo-editor');
		expect(editor.dataset.memoId).toBe('memo-1');
		expect(editor.dataset.create).toBe('false');
	});

	it('create ビューは MemoEditor を isCreate で描画する', () => {
		setView('memo', 'create');
		vi.mocked(useActiveTheme).mockReturnValue(mockTheme);

		const { getByTestId } = render(<DesktopLayout />);
		expect(getByTestId('memo-editor').dataset.create).toBe('true');
	});
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { useShellThemeStore } from '../../stores/useShellThemeStore';
import { useMemoDataStore } from '../../stores/useMemoDataStore';

/*
 * themeResolutionIntegration.test.tsx — テーマ解決優先順位の統合テスト（theme-immersive-world / Task 7.1）
 * ==============================================================================================================
 * 何を守るテストか:
 *   Task 3〜6 で実装した「テーマ解決優先順位（文脈 > シェル床 > null）」と
 *   「非森リグレッション（data-theme 未設定 → 中立既定）」を、ストア状態遷移を通じた
 *   統合シナリオとして固定する。併せて外部 JS ライブラリ未追加の制約を静的に検証する。
 *
 *   (a) 非森リグレッション — data-theme 未設定 → null → 玄関は中立既定描画（7.1）
 *   (b) 優先順位シナリオ — shell=mori → notebook(kami)上書き → Home戻りでshell復帰（7.1, 7.2）
 *   (c) 外部 JS ライブラリ未追加 — package.json に禁止ライブラリが含まれない（7.2）
 *
 *   _Requirements: 7.1, 7.2_
 */

// 外部クエリをモック（非同期データ取得）
vi.mock('../../hooks/useNotebookQueries', () => ({
	useNotebooks: vi.fn(() => ({ data: [] })),
}));
vi.mock('../../hooks/useMemoQueries', () => ({
	useMemo: vi.fn(() => ({ data: undefined })),
}));
vi.mock('../../hooks/useThemeQueries', () => ({
	useThemes: vi.fn(() => ({ data: [] })),
}));

import { useNotebooks } from '../../hooks/useNotebookQueries';
import { useThemes } from '../../hooks/useThemeQueries';
import { useActiveTheme } from '../../hooks/useActiveTheme';

type NotebooksResult = ReturnType<typeof useNotebooks>;
type ThemesResult = ReturnType<typeof useThemes>;

const moriTheme = {
	id: 'theme-mori',
	name: '森',
	cssFilePath: 'mori/mori.css',
	styles: undefined as undefined,
	metadata: { effectKey: 'mori' as const },
};

const kamiTheme = {
	id: 'theme-kami',
	name: 'kami',
	cssFilePath: 'kami/kami.css',
	styles: undefined as undefined,
	metadata: undefined as undefined,
};

describe('Task 7.1 (a): 非森リグレッション — data-theme 未設定で中立既定を返す（Req 7.1）', () => {
	beforeEach(() => {
		useShellThemeStore.setState({ selection: null });
		useMemoDataStore.setState({ selectedNotebookId: null, selectedMemoId: null });
		vi.mocked(useNotebooks).mockReturnValue({ data: [] } as unknown as NotebooksResult);
		vi.mocked(useThemes).mockReturnValue({ data: [] } as unknown as ThemesResult);
	});

	it('shell 未設定 + 文脈なし → null を返す（玄関は中立既定で描画される）', () => {
		const { result } = renderHook(() => useActiveTheme());
		expect(result.current).toBeNull();
	});

	it('shell 未設定 + ノートブック未選択 → null。非森の見た目は本スペック実装前と同一', () => {
		useMemoDataStore.setState({ selectedNotebookId: null, selectedMemoId: null });
		const { result } = renderHook(() => useActiveTheme());
		expect(result.current).toBeNull();
	});
});

describe('Task 7.1 (b): テーマ解決優先順位シナリオ — shell=mori → 文脈上書き → shell復帰（Req 7.1, 7.2）', () => {
	beforeEach(() => {
		useShellThemeStore.setState({ selection: null });
		useMemoDataStore.setState({ selectedNotebookId: null, selectedMemoId: null });
		vi.mocked(useNotebooks).mockReturnValue({ data: [] } as unknown as NotebooksResult);
		vi.mocked(useThemes).mockReturnValue({ data: [] } as unknown as ThemesResult);
	});

	it('シェル床=mori + 文脈なし → mori を返す（「開いた瞬間に森」/ 2.1）', () => {
		act(() => {
			useShellThemeStore.setState({ selection: { id: 'theme-mori', slug: 'mori' } });
		});
		vi.mocked(useThemes).mockReturnValue({
			data: [moriTheme],
		} as unknown as ThemesResult);

		const { result } = renderHook(() => useActiveTheme());
		expect(result.current?.id).toBe('theme-mori');
	});

	it('シェル床=mori → kami テーマ付きノートブックへ遷移 → Home 復帰 の3ステップシナリオ', () => {
		// ステップ1: shell=mori、ノートブック未選択 → mori を返す
		act(() => {
			useShellThemeStore.setState({ selection: { id: 'theme-mori', slug: 'mori' } });
		});
		vi.mocked(useThemes).mockReturnValue({
			data: [moriTheme],
		} as unknown as ThemesResult);
		vi.mocked(useNotebooks).mockReturnValue({
			data: [{ id: 'nb-kami', name: 'Kami NB', theme: kamiTheme }],
		} as unknown as NotebooksResult);

		const { result, rerender } = renderHook(() => useActiveTheme());
		expect(result.current?.id).toBe('theme-mori'); // shell が返る

		// ステップ2: kami テーマ付きノートブックを選択 → kami が優先される（文脈 > シェル）
		act(() => {
			useMemoDataStore.setState({ selectedNotebookId: 'nb-kami' });
		});
		rerender();
		expect(result.current?.id).toBe('theme-kami'); // 文脈テーマが shell より優先

		// ステップ3: Home へ戻る（ノートブック選択をクリア） → shell=mori に復帰
		act(() => {
			useMemoDataStore.setState({ selectedNotebookId: null });
		});
		rerender();
		expect(result.current?.id).toBe('theme-mori'); // shell に復帰
	});

	it('文脈テーマなし + shell=mori でキャッシュ未充足 → slug由来の最小テーマを返しCSS/エフェクト解決を途切れさせない（1.5）', () => {
		act(() => {
			useShellThemeStore.setState({ selection: { id: 'theme-mori', slug: 'mori' } });
		});
		// キャッシュ未充足: data が空
		vi.mocked(useThemes).mockReturnValue({ data: [] } as unknown as ThemesResult);

		const { result } = renderHook(() => useActiveTheme());
		expect(result.current).not.toBeNull();
		expect(result.current?.id).toBe('theme-mori');
		// metadata.effectKey が解決可能 → ThemeEffectHost が機能する（不変則）
		expect(result.current?.metadata?.effectKey).toBe('mori');
	});
});

describe('Task 7.1 (c): 外部 JS ライブラリ未追加の静的検証（Req 7.2）', () => {
	it('package.json に外部アニメーションライブラリが含まれない', () => {
		const pkgPath = join(__dirname, '../../../package.json');
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};

		const allDeps = {
			...(pkg.dependencies ?? {}),
			...(pkg.devDependencies ?? {}),
		};

		// 外部 JS アニメーション・3Dライブラリを禁止（7.2: 外部 JS 追加ゼロの制約）
		const PROHIBITED_LIBS = [
			'three',
			'gsap',
			'anime',
			'pixi',
			'framer-motion',
			'@react-spring',
			'lottie',
			'greensock',
			'velocity',
		];

		for (const lib of PROHIBITED_LIBS) {
			const found = Object.keys(allDeps).filter((dep) => dep.includes(lib));
			expect(
				found,
				`外部アニメーションライブラリ "${lib}" が package.json に検出されました（Req 7.2）`,
			).toHaveLength(0);
		}
	});
});

import { useEffect } from 'react';
import { useViewStore } from '../../stores/useViewStore';
import { useMemoDataStore } from '../../stores/useMemoDataStore';
import { usePaletteStore } from '../../stores/usePaletteStore';
import { useNavigation } from '../../hooks/useNavigation';
import { useMemo as useMemoQuery } from '../../hooks/useMemoQueries';
import { useAppInit } from '../../hooks/useAppInit';
import { useReconnectSync } from '../../hooks/useReconnectSync';
import { useActiveTheme } from '../../hooks/useActiveTheme';
import { useThemeCSS } from '../../hooks/useThemeCSS';
import { useDocumentThemeSync } from '../../hooks/useDocumentThemeSync';
import { ThemeEffectHost } from '../effects/ThemeEffectHost';
import { Header } from '../ui/Header';
import { MemoEditor } from '../memo/MemoEditor';
import { MemoList } from '../memo/MemoList';
import { TrashView } from '../memo/TrashView';
import { TagManager } from '../tag/TagManager';
import { NotebookEditor } from '../notebook/NotebookEditor';
import { NotebookList } from '../notebook/NotebookList';
import { MemoPalette } from '../memo/MemoPalette';
import { FocusMemoOverlay } from '../memo/FocusMemoOverlay';
import { HomeDashboard } from '../home/HomeDashboard';
import { getEffectKey } from '../../types/theme';
import { ShellThemeSelector } from '../theme/ShellThemeSelector';

const EmptyMemoView = () => {
	const isMac = /Mac|iPod|iPhone|iPad/.test(window.navigator.platform);
	const shortcutKey = isMac ? 'Cmd + Option' : 'Ctrl + Alt';

	return (
		<div className="flex flex-col items-center justify-center h-full text-center text-[var(--on-surface-variant)]">
			<p>メモを選択してください</p>
			<p className="mt-2 text-sm text-[var(--on-surface-variant)]">新規作成: {shortcutKey} + N</p>
		</div>
	);
};

export const DesktopLayout = () => {
	const { currentObject, currentView } = useViewStore();
	const { selectedMemoId, selectedNotebookId } = useMemoDataStore();
	const { paletteOpen, paletteMode, closeMemoPalette, openMemoPalette } = usePaletteStore();
	const { goToMemoCreate, goToNotebookCreate } = useNavigation();
	const { data: selectedMemo } = useMemoQuery(selectedMemoId ?? '');
	const activeTheme = useActiveTheme();
	useThemeCSS(activeTheme);
	useDocumentThemeSync(activeTheme);
	useAppInit(); // アプリ初期化（タグロード等）
	useReconnectSync(); // 再接続時のサーバー状態再取得

	// ショートカットキーのハンドリング
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// OSやキーボードレイアウトによって e.key が 'n' にならない場合があるため、
			// 物理キーコードである e.code で判定する
			if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyN') {
				e.preventDefault();
				goToMemoCreate();
			}

			// Cmd/Ctrl + K: メモ選択パレット
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				openMemoPalette('memo-select');
			}

			// Cmd/Ctrl + P: ノートブック選択パレット（2段階）
			if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
				e.preventDefault();
				openMemoPalette('notebook-select');
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [goToMemoCreate, openMemoPalette]);

	const renderMainContent = () => {
		// objectとviewの組み合わせで画面を切り替え
		switch (currentObject) {
			case 'home':
				return <HomeDashboard />;

			case 'memo':
				switch (currentView) {
					case 'list':
						return <MemoList />;

					case 'edit':
						return selectedMemo ? (
							<MemoEditor memo={selectedMemo} />
						) : (
							<div className="flex items-center justify-center h-full text-[var(--on-surface-variant)]">
								メモが選択されていません
							</div>
						);

					case 'create':
						return <MemoEditor isCreate />;

					case 'trash':
						return <TrashView />;

					default:
						return <EmptyMemoView />;
				}

			case 'tag':
				return <TagManager />;

			case 'notebook':
				switch (currentView) {
					case 'list':
						return <NotebookList />;
					case 'create':
						return <NotebookEditor isCreate />;
					case 'edit':
						return <NotebookEditor notebookId={selectedNotebookId ?? undefined} />;
					default:
						return <NotebookList />;
				}

			case 'theme':
				return <ShellThemeSelector />;

			default:
				return <EmptyMemoView />;
		}
	};

	return (
		<div
			className={`h-dvh flex flex-col app-shell ${activeTheme ? 'theme-root' : ''}`}
			data-theme={getEffectKey(activeTheme)}
			data-theme-id={activeTheme?.id}
		>
			<ThemeEffectHost theme={activeTheme} />

			{/* 生きた背景（MoriEffectLayer / fixed z-0）より前面にコンテンツを重ねる（ログイン画面と同じ z-10 の床） */}
			<div className="relative z-10 flex-shrink-0">
				<Header onMemoCreateClick={goToMemoCreate} onNotebookCreateClick={goToNotebookCreate} />
			</div>

			<main className="relative z-10 flex-1 flex overflow-hidden">
				{/* 右メインエリア - メモ詳細/編集 */}
				<div className="flex-1 flex flex-col">{renderMainContent()}</div>
			</main>

			{/* メモパレット */}
			<MemoPalette isOpen={paletteOpen} onClose={closeMemoPalette} initialMode={paletteMode} />

			{/* 表示モードオーバーレイ */}
			<FocusMemoOverlay />
		</div>
	);
};

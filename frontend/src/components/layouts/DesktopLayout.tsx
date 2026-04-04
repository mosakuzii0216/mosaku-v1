import { useEffect } from 'react';
import { useViewStore } from '../../stores/useViewStore';
import { useMemoDataStore } from '../../stores/useMemoDataStore';
import { usePaletteStore } from '../../stores/usePaletteStore';
import { useNavigation } from '../../hooks/useNavigation';
import { useMemo as useMemoQuery } from '../../hooks/useMemoQueries';
import { useAppInit } from '../../hooks/useAppInit';
import { Header } from '../ui/Header';
import { MemoEditor } from '../memo/MemoEditor';
import { MemoList } from '../memo/MemoList';
import { TrashView } from '../memo/TrashView';
import { TagManager } from '../tag/TagManager';
import { NotebookEditor } from '../notebook/NotebookEditor';
import { NotebookList } from '../notebook/NotebookList';
import { MemoPalette } from '../memo/MemoPalette';

const EmptyMemoView = () => {
	const isMac = /Mac|iPod|iPhone|iPad/.test(window.navigator.platform);
	const shortcutKey = isMac ? 'Cmd + Option' : 'Ctrl + Alt';

	return (
		<div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
			<p>メモを選択してください</p>
			<p className="mt-2 text-sm text-gray-400">新規作成: {shortcutKey} + N</p>
		</div>
	);
};

export const DesktopLayout = () => {
	const { currentObject, currentView } = useViewStore();
	const { selectedMemoId, selectedNotebookId } = useMemoDataStore();
	const { paletteOpen, paletteMode, closeMemoPalette, openMemoPalette } = usePaletteStore();
	const { goToMemoCreate, goToNotebookCreate } = useNavigation();
	const { data: selectedMemo } = useMemoQuery(selectedMemoId ?? '');
	useAppInit(); // アプリ初期化（タグロード等）

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
			case 'memo':
				switch (currentView) {
					case 'list':
						return <MemoList />;

					case 'edit':
						return selectedMemo ? (
							<MemoEditor memo={selectedMemo} />
						) : (
							<div className="flex items-center justify-center h-full text-gray-500">
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
				// TODO: テーマ管理画面を実装
				return (
					<div className="flex items-center justify-center h-full text-gray-500">
						テーマ管理（未実装）
					</div>
				);

			default:
				return <EmptyMemoView />;
		}
	};

	return (
		<div className="h-screen flex flex-col bg-white">
			<Header onMemoCreateClick={goToMemoCreate} onNotebookCreateClick={goToNotebookCreate} />

			<main className="flex-1 flex overflow-hidden">
				{/* 右メインエリア - メモ詳細/編集 */}
				<div className="flex-1 flex flex-col">{renderMainContent()}</div>
			</main>

			{/* メモパレット */}
			<MemoPalette isOpen={paletteOpen} onClose={closeMemoPalette} initialMode={paletteMode} />
		</div>
	);
};

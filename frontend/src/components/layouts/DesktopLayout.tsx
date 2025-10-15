import { useEffect } from 'react';
import { useMemoStore } from '../../stores/useMemoStore';
import { useAppInit } from '../../hooks/useAppInit';
import { Header } from '../ui/Header';
import { MemoList } from '../memo/MemoList';
import { MemoDetail } from '../memo/MemoDetail';
import { MemoEditor } from '../memo/MemoEditor';
import { TagManager } from '../tag/TagManager';
import { NotebookEditor } from '../notebook/NotebookEditor';

const EmptyMemoView = () => {
	const isMac = /Mac|iPod|iPhone|iPad/.test(window.navigator.platform);
	const shortcutKey = isMac ? 'Cmd + Option' : 'Ctrl + Alt';

	return (
		<div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
			<p>メモを選択してください</p>
			<p className="mt-2 text-sm text-gray-400 dark:text-gray-500">新規作成: {shortcutKey} + N</p>
		</div>
	);
};

export const DesktopLayout = () => {
	const { currentObject, currentView, selectedMemo, goToMemoCreate, goToNotebookCreate } =
		useMemoStore();
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
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [goToMemoCreate]);

	const renderMainContent = () => {
		// objectとviewの組み合わせで画面を切り替え
		switch (currentObject) {
			case 'memo':
				switch (currentView) {
					case 'detail':
						return selectedMemo ? <MemoDetail memo={selectedMemo} /> : <EmptyMemoView />;

					case 'edit':
						return selectedMemo ? (
							<MemoEditor memo={selectedMemo} />
						) : (
							<div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
								メモが選択されていません
							</div>
						);

					case 'create':
						return <MemoEditor isCreate />;

					default:
						return <EmptyMemoView />;
				}

			case 'tag':
				return <TagManager />;

			case 'notebook':
				return <NotebookEditor isCreate />;

			case 'theme':
				// TODO: テーマ管理画面を実装
				return (
					<div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
						テーマ管理（未実装）
					</div>
				);

			default:
				return <EmptyMemoView />;
		}
	};

	return (
		<div className="h-screen flex flex-col bg-white dark:bg-gray-900">
			<Header onMemoCreateClick={goToMemoCreate} onNotebookCreateClick={goToNotebookCreate} />

			<main className="flex-1 flex overflow-hidden">
				{/* 左サイドバー - メモ一覧 (memoオブジェクト時のみ表示) */}
				{currentObject === 'memo' && (
					<div className="w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col">
						<MemoList />
					</div>
				)}

				{/* 右メインエリア - メモ詳細/編集 */}
				<div className="flex-1 flex flex-col">{renderMainContent()}</div>
			</main>
		</div>
	);
};

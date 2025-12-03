import { useEffect } from 'react';
import { useMemoStore } from '../../stores/useMemoStore';
import { useAppInit } from '../../hooks/useAppInit';
import { useMemoPalette } from '../../hooks/useMemoPalette';
import { Header } from '../ui/Header';
import { MemoEditor } from '../memo/MemoEditor';
import { TagManager } from '../tag/TagManager';
import { NotebookList } from '../notebook/NotebookList';
import { NotebookEditor } from '../notebook/NotebookEditor';
import { MemoPalette } from '../memo/MemoPalette';

export const MobileLayout = () => {
	const {
		currentObject,
		currentView,
		selectedMemo,
		goToMemoCreate,
		goToNotebookCreate,
		selectedNotebookId,
	} = useMemoStore();
	useAppInit(); // アプリ初期化（タグロード等）
	const { isOpen, mode, closePalette } = useMemoPalette();

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

	const renderContent = () => {
		switch (currentObject) {
			case 'memo':
				switch (currentView) {
					case 'list':
						return (
							<div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
								<p>メモ一覧は現在利用できません</p>
								<p className="mt-2 text-sm text-gray-400">
									新規作成:{' '}
									{/Mac|iPod|iPhone|iPad/.test(window.navigator.platform)
										? 'Cmd + Option'
										: 'Ctrl + Alt'}{' '}
									+ N
								</p>
							</div>
						);

					case 'edit':
						return selectedMemo ? (
							<MemoEditor memo={selectedMemo} />
						) : (
							<div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
								<p>メモが選択されていません</p>
								<p className="mt-2 text-sm text-gray-400">
									新規作成:{' '}
									{/Mac|iPod|iPhone|iPad/.test(window.navigator.platform)
										? 'Cmd + Option'
										: 'Ctrl + Alt'}{' '}
									+ N
								</p>
							</div>
						);
					case 'create':
						return <MemoEditor isCreate />;
				}
				// 内部switchが網羅的でも静的解析ではfallthroughと判断されるため明示的にbreak
				break;
			case 'notebook':
				switch (currentView) {
					case 'list':
						return <NotebookList />;
					case 'create':
						return <NotebookEditor isCreate />;
					case 'edit':
						return <NotebookEditor notebookId={selectedNotebookId ?? undefined} />;
				}
				break;
				// fallthrough防止のため明示的にbreak
				break;
			case 'tag':
				return <TagManager />;

			default:
				return (
					<div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
						<p>メモ一覧は現在利用できません</p>
					</div>
				);
		}
	};

	return (
		<div className="h-screen flex flex-col bg-white">
			<Header onMemoCreateClick={goToMemoCreate} onNotebookCreateClick={goToNotebookCreate} />
			<main className="flex-1 overflow-hidden">{renderContent()}</main>

			{/* メモパレット */}
			<MemoPalette isOpen={isOpen} onClose={closePalette} initialMode={mode} />
		</div>
	);
};

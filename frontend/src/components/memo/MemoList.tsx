import { useMemoStore } from '../../stores/useMemoStore';
import { useMemos } from '../../hooks/useMemoQueries';
import { useNotebooks } from '../../hooks/useNotebookQueries';
import { MemoItem } from './MemoItem';
// import { MemoSearch } from './MemoSearch';

export const MemoList = () => {
	const { memos, notebookFilter, setNotebookFilter } = useMemoStore();
	const { isLoading, error } = useMemos();
	const { data: notebooks = [] } = useNotebooks();

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-gray-500 dark:text-gray-400">読み込み中...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-red-500 dark:text-red-400">
					<div>エラーが発生しました</div>
					<div className="text-sm mt-2">
						{error instanceof Error ? error.message : 'Unknown error'}
					</div>
				</div>
			</div>
		);
	}

	// ノートブック機能実装のため一時的に検索機能を無効化
	// const filteredMemos = searchQuery
	//   ? memos.filter(
	//       (memo) =>
	//         memo.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
	//         memo.content.toLowerCase().includes(searchQuery.toLowerCase())
	//     )
	//   : memos;

	// Notebookフィルタに応じて表示を切り替え
	const filteredMemos = (() => {
		if (notebookFilter === 'ALL') return memos;
		if (notebookFilter === 'INBOX') return memos.filter((m) => !m.notebookId);
		return memos.filter((m) => m.notebookId === notebookFilter);
	})();

	return (
		<div className="flex flex-col h-full">
			{/* ノートブック機能実装のため一時的に検索機能を無効化 */}
			{/* <MemoSearch /> */}

			<div className="flex-1 overflow-y-auto">
				{notebookFilter !== 'ALL' && (
					<div className="px-4 py-2 text-sm bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-b border-yellow-100 dark:border-yellow-800 flex items-center justify-between">
						<span>
							{(() => {
								if (notebookFilter === 'INBOX') {
									return 'フィルタ中: Inbox（未選択）';
								}
								const notebook = notebooks.find((n) => n.id === notebookFilter);
								const notebook_name = notebook?.name ?? '無題のノートブック';
								return `フィルタ中: ${notebook_name}`;
							})()}
						</span>
						<button
							className="px-2 py-1 border rounded text-xs"
							onClick={() => setNotebookFilter('ALL')}
						>
							フィルタ解除
						</button>
					</div>
				)}
				<div>
					{filteredMemos.map((memo) => (
						<MemoItem key={memo.id} memo={memo} />
					))}
				</div>
				{/* ノートブック機能実装のため一時的に検索機能を無効化 */}
				{/* {filteredMemos.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            {searchQuery ? '検索結果がありません' : 'メモがありません'}
          </div>
        ) : (
          <div>
            {filteredMemos.map((memo) => (
              <MemoItem key={memo.id} memo={memo} />
            ))}
          </div>
        )} */}
			</div>
		</div>
	);
};

import { useNotebooks } from '../../hooks/useNotebookQueries';
import { useMemoStore } from '../../stores/useMemoStore';

export const NotebookList = () => {
	const { data: notebooks = [], isLoading, error } = useNotebooks();
	const { goToMemosForNotebook, goToNotebookEdit } = useMemoStore();

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

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 overflow-y-auto">
				<ul>
					<li
						className="p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
						onClick={() => goToMemosForNotebook('ALL')}
					>
						<div className="flex items-center justify-between">
							<div className="font-medium text-gray-900 dark:text-white">すべてのメモ</div>
						</div>
					</li>
					<li
						className="p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
						onClick={() => goToMemosForNotebook('INBOX')}
					>
						<div className="flex items-center justify-between">
							<div className="font-medium text-gray-900 dark:text-white">未選択</div>
						</div>
					</li>
					{notebooks.map((nb) => (
						<li
							key={nb.id}
							className="p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
							onClick={() => goToMemosForNotebook(nb.id)}
						>
							<div className="flex items-center justify-between gap-3">
								<div className="font-medium text-gray-900 dark:text-white">
									{nb.name || '(名称未設定)'}
								</div>
								<div className="flex items-center gap-3">
									<div className="text-xs text-gray-500 dark:text-gray-400">
										{new Date(nb.updatedAt).toLocaleString('ja-JP')}
									</div>
									<button
										onClick={(e) => {
											e.stopPropagation();
											goToNotebookEdit(nb.id);
										}}
										className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600"
									>
										編集
									</button>
								</div>
							</div>
							{nb.theme && (
								<div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
									テーマ: {nb.theme.name}
								</div>
							)}
						</li>
					))}
				</ul>
			</div>
		</div>
	);
};

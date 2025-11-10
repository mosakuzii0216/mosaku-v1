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
			<div className="flex-1 overflow-y-auto p-4">
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{/* すべてのメモ */}
					<div
						className="relative p-6 rounded-lg border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 cursor-pointer transition-all hover:shadow-lg bg-white dark:bg-gray-800"
						onClick={() => goToMemosForNotebook('ALL')}
					>
						<div className="flex flex-col h-full">
							<div className="text-lg font-bold text-gray-900 dark:text-white mb-2">
								すべてのメモ
							</div>
							<div className="text-sm text-gray-500 dark:text-gray-400">全てのメモを表示</div>
						</div>
					</div>

					{/* 未選択（INBOX） */}
					<div
						className="relative p-6 rounded-lg border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 cursor-pointer transition-all hover:shadow-lg bg-white dark:bg-gray-800"
						onClick={() => goToMemosForNotebook('INBOX')}
					>
						<div className="flex flex-col h-full">
							<div className="text-lg font-bold text-gray-900 dark:text-white mb-2">未選択</div>
							<div className="text-sm text-gray-500 dark:text-gray-400">
								ノートブック未設定のメモ
							</div>
						</div>
					</div>

					{/* ノートブック一覧 */}
					{notebooks.map((nb) => (
						<div
							key={nb.id}
							className="relative p-6 rounded-lg border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 cursor-pointer transition-all hover:shadow-lg bg-white dark:bg-gray-800 group"
							onClick={() => goToMemosForNotebook(nb.id)}
						>
							<div className="flex flex-col h-full">
								<div className="flex items-start justify-between mb-2">
									<div className="text-lg font-bold text-gray-900 dark:text-white break-words flex-1">
										{nb.name || '(名称未設定)'}
									</div>
									<button
										onClick={(e) => {
											e.stopPropagation();
											goToNotebookEdit(nb.id);
										}}
										className="ml-2 px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
									>
										編集
									</button>
								</div>

								<div className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
									<svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
										<path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
										<path
											fillRule="evenodd"
											d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"
											clipRule="evenodd"
										/>
									</svg>
									<span>{nb.theme ? <>{nb.theme.name}</> : 'テーマ未設定'}</span>
								</div>

								<div className="mt-auto text-xs text-gray-400 dark:text-gray-500">
									{new Date(nb.updatedAt).toLocaleDateString('ja-JP', {
										year: 'numeric',
										month: 'short',
										day: 'numeric',
									})}
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

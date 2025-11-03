import { useNotebooks } from '../../hooks/useNotebookQueries';

export const NotebookList = () => {
	const { data: notebooks = [], isLoading, error } = useNotebooks();

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
					{notebooks.map((nb) => (
						<li key={nb.id} className="p-4 border-b border-gray-100 dark:border-gray-700">
							<div className="flex items-center justify-between">
								<div className="font-medium text-gray-900 dark:text-white">
									{nb.name || '(名称未設定)'}
								</div>
								<div className="text-xs text-gray-500 dark:text-gray-400">
									{new Date(nb.updatedAt).toLocaleString('ja-JP')}
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

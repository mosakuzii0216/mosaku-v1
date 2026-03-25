import {
	useTrashMemos,
	useRestoreMemo,
	usePermanentDeleteMemo,
	useEmptyTrash,
} from '../../hooks/useMemoQueries';
import { Trash2, RotateCcw, X } from 'lucide-react';

const getDaysRemaining = (trashedAt: string): number => {
	const trashed = new Date(trashedAt).getTime();
	const now = Date.now();
	const daysSinceTrashed = (now - trashed) / (1000 * 60 * 60 * 24);
	return Math.max(0, 30 - Math.floor(daysSinceTrashed));
};

export const TrashView = () => {
	const { data: trashedMemos = [], isLoading } = useTrashMemos();
	const restoreMutation = useRestoreMemo();
	const permanentDeleteMutation = usePermanentDeleteMemo();
	const emptyTrashMutation = useEmptyTrash();

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full text-gray-500">読み込み中...</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* ヘッダー */}
			<div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
				<div className="flex items-center gap-2">
					<Trash2 className="w-5 h-5 text-gray-500" />
					<h1 className="text-lg font-semibold text-gray-800">ゴミ箱</h1>
					<span className="text-sm text-gray-500">（{trashedMemos.length} 件）</span>
				</div>
				<button
					onClick={() => emptyTrashMutation.mutate()}
					disabled={trashedMemos.length === 0 || emptyTrashMutation.isPending}
					className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-300 rounded hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
				>
					ゴミ箱を空にする
				</button>
			</div>

			{/* メモ一覧 */}
			<div className="flex-1 overflow-y-auto">
				{trashedMemos.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full text-gray-400">
						<Trash2 className="w-12 h-12 mb-3 opacity-30" />
						<p>ゴミ箱は空です</p>
					</div>
				) : (
					<ul className="divide-y divide-gray-100">
						{trashedMemos.map((memo) => {
							const daysRemaining = memo.trashedAt ? getDaysRemaining(memo.trashedAt) : 0;
							const trashedDate = memo.trashedAt
								? new Date(memo.trashedAt).toLocaleDateString('ja-JP')
								: '';

							return (
								<li
									key={memo.id}
									className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
								>
									<div className="flex-1 min-w-0 mr-4">
										<p className="font-medium text-gray-800 truncate">
											{memo.title || '（タイトルなし）'}
										</p>
										<p className="text-sm text-gray-500 mt-0.5">
											削除日: {trashedDate} 自動削除まで{' '}
											<span className={daysRemaining <= 3 ? 'text-red-500 font-medium' : ''}>
												{daysRemaining} 日
											</span>
										</p>
									</div>
									<div className="flex items-center gap-2 shrink-0">
										<button
											onClick={() => restoreMutation.mutate(memo.id)}
											disabled={restoreMutation.isPending}
											className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-40"
											title="復元"
										>
											<RotateCcw className="w-4 h-4" />
										</button>
										<button
											onClick={() => permanentDeleteMutation.mutate(memo.id)}
											disabled={permanentDeleteMutation.isPending}
											className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-40"
											title="完全削除"
										>
											<X className="w-4 h-4" />
										</button>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
};

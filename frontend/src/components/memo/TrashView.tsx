import {
	useTrashMemos,
	useRestoreMemo,
	usePermanentDeleteMemo,
	useEmptyTrash,
} from '../../hooks/useMemoQueries';
import { Trash2, RotateCcw, X } from 'lucide-react';
import { TRASH_RETENTION_DAYS } from '../../constants/trash';
import { MS_PER_DAY } from '../../utils/jstDate';
import { formatDateJa } from '../../utils/formatDate';

const getDaysRemaining = (trashedAt: string): number => {
	const trashed = new Date(trashedAt).getTime();
	const now = Date.now();
	const daysSinceTrashed = (now - trashed) / MS_PER_DAY;
	return Math.max(0, TRASH_RETENTION_DAYS - Math.floor(daysSinceTrashed));
};

export const TrashView = () => {
	const { data: trashedMemos = [], isLoading } = useTrashMemos();
	const restoreMutation = useRestoreMemo();
	const permanentDeleteMutation = usePermanentDeleteMemo();
	const emptyTrashMutation = useEmptyTrash();

	if (isLoading) {
		return (
			<div className="shell-surface flex items-center justify-center h-full">
				<span className="shell-text-muted">読み込み中...</span>
			</div>
		);
	}

	return (
		<div className="shell-surface flex flex-col h-full">
			{/* ヘッダー */}
			<div className="flex items-center justify-between px-6 py-4 border-b border-[var(--outline)]">
				<div className="flex items-center gap-2">
					<Trash2 className="w-5 h-5 shell-text-muted" />
					<h1 className="text-lg font-semibold">ゴミ箱</h1>
					<span className="shell-text-muted">（{trashedMemos.length} 件）</span>
				</div>
				<button
					onClick={() => emptyTrashMutation.mutate()}
					disabled={trashedMemos.length === 0 || emptyTrashMutation.isPending}
					className="px-3 py-1.5 text-sm font-medium rounded transition-colors disabled:cursor-not-allowed text-[var(--danger)] border border-[var(--danger)] hover:bg-[var(--danger-container)] disabled:text-[var(--on-surface-variant)] disabled:border-[var(--outline)] disabled:hover:bg-transparent"
				>
					ゴミ箱を空にする
				</button>
			</div>

			{/* メモ一覧 */}
			<div className="flex-1 overflow-y-auto">
				{trashedMemos.length === 0 ? (
					<div className="shell-text-muted flex flex-col items-center justify-center h-full">
						<Trash2 className="w-12 h-12 mb-3 opacity-30" />
						<p>ゴミ箱は空です</p>
					</div>
				) : (
					<ul className="divide-y divide-[var(--outline)]">
						{trashedMemos.map((memo) => {
							const daysRemaining = memo.trashedAt ? getDaysRemaining(memo.trashedAt) : 0;
							const trashedDate = memo.trashedAt ? formatDateJa(memo.trashedAt) : '';

							return (
								<li
									key={memo.id}
									className="flex items-center justify-between px-6 py-4 hover:bg-[var(--state-hover)]"
								>
									<div className="flex-1 min-w-0 mr-4">
										<p className="font-medium truncate">{memo.title || '（タイトルなし）'}</p>
										<p className="shell-text-muted mt-0.5">
											削除日: {trashedDate} 自動削除まで{' '}
											<span
												className={daysRemaining <= 3 ? 'text-[var(--danger)] font-medium' : ''}
											>
												{daysRemaining} 日
											</span>
										</p>
									</div>
									<div className="flex items-center gap-2 shrink-0">
										<button
											onClick={() => restoreMutation.mutate(memo.id)}
											disabled={restoreMutation.isPending}
											className="p-2 rounded transition-colors disabled:opacity-40 text-[var(--accent)] hover:bg-[var(--state-hover)]"
											title="復元"
										>
											<RotateCcw className="w-4 h-4" />
										</button>
										<button
											onClick={() => permanentDeleteMutation.mutate(memo.id)}
											disabled={permanentDeleteMutation.isPending}
											className="p-2 rounded transition-colors disabled:opacity-40 text-[var(--danger)] hover:bg-[var(--danger-container)]"
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

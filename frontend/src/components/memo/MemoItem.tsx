import type { Memo } from '../../types/memo';

interface MemoItemProps {
	memo: Memo;
	onClick: () => void;
}

export const MemoItem = ({ memo, onClick }: MemoItemProps) => {
	// HTMLタグを除去してプレーンテキストに変換
	const plainContent = memo.content.replace(/<[^>]*>/g, '');

	return (
		<div
			onClick={onClick}
			data-testid="memo-item"
			data-memo-id={memo.id}
			className="shell-card cursor-pointer"
		>
			<div className="flex items-start justify-between">
				<div className="flex-1 min-w-0">
					{/* タイトル */}
					<h3 className="text-lg font-semibold text-[var(--on-surface)] truncate mb-1">
						{memo.title || '無題'}
					</h3>

					{/* コンテンツプレビュー */}
					{plainContent && (
						<p className="text-sm text-[var(--on-surface-variant)] line-clamp-2 mb-2">
							{plainContent}
						</p>
					)}

					{/* メタ情報 */}
					<div className="flex items-center gap-3 text-xs text-[var(--on-surface-variant)]">
						<span>{new Date(memo.updatedAt).toLocaleDateString('ja-JP')}</span>

						{/* タグ */}
						{memo.memoTags && memo.memoTags.length > 0 && (
							<span className="flex items-center gap-1">
								<svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
									<path
										fillRule="evenodd"
										d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z"
										clipRule="evenodd"
									/>
								</svg>
								{memo.memoTags.length}
							</span>
						)}

						{/* ノートブック */}
						{memo.notebook && (
							<span className="flex items-center gap-1">
								<svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
									<path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
								</svg>
								{memo.notebook.name}
							</span>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

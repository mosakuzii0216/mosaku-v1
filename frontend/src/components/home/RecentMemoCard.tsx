import type { RecentMemoDto } from '../../types/dashboard';

interface RecentMemoCardProps {
	memo: RecentMemoDto;
	onClick: () => void;
}

const formatDate = (isoString: string) => {
	const date = new Date(isoString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return '今日';
	if (diffDays === 1) return '昨日';
	if (diffDays < 7) return `${diffDays}日前`;
	return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
};

export const RecentMemoCard = ({ memo, onClick }: RecentMemoCardProps) => {
	const displayText = memo.title || memo.contentPreview || '無題';

	return (
		<button onClick={onClick} className="flex-shrink-0 w-40 p-3 shell-card text-left">
			<p className="text-sm font-medium text-[var(--on-surface)] line-clamp-2 mb-2">
				{displayText}
			</p>
			<p className="text-xs text-[var(--on-surface-variant)]">{formatDate(memo.updatedAt)}</p>
		</button>
	);
};

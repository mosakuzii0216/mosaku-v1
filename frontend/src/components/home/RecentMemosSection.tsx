import { useRecentMemos } from '../../hooks/useHomeDashboardQueries';
import { useNavigation } from '../../hooks/useNavigation';
import { RecentMemoCard } from './RecentMemoCard';

const SkeletonCard = () => (
	<div
		data-testid="skeleton-card"
		className="flex-shrink-0 w-40 h-24 bg-gray-100 rounded-xl animate-pulse"
	/>
);

export const RecentMemosSection = () => {
	const { data: memos, isLoading, isError, refetch } = useRecentMemos();
	const { goToMemoEditById, goToMemoCreate } = useNavigation();

	return (
		<div className="px-4 py-3">
			<h2 className="text-sm font-semibold text-gray-500 mb-2">直近のメモ</h2>
			{isLoading && (
				<div className="flex gap-3 overflow-x-auto pb-1">
					<SkeletonCard />
					<SkeletonCard />
					<SkeletonCard />
				</div>
			)}
			{isError && (
				<div className="text-sm text-gray-500">
					<p>データを取得できませんでした</p>
					<button
						onClick={() => refetch()}
						className="mt-1 text-blue-500 hover:text-blue-600 text-sm"
					>
						再試行
					</button>
				</div>
			)}
			{!isLoading && !isError && memos?.length === 0 && (
				<div className="text-sm text-gray-400">
					<p>まだメモがありません</p>
					<button onClick={goToMemoCreate} className="mt-1 text-blue-500 hover:text-blue-600">
						最初のメモを書く
					</button>
				</div>
			)}
			{!isLoading && !isError && memos && memos.length > 0 && (
				<div className="flex gap-3 overflow-x-auto pb-1">
					{memos.map((memo) => (
						<RecentMemoCard key={memo.id} memo={memo} onClick={() => goToMemoEditById(memo.id)} />
					))}
				</div>
			)}
		</div>
	);
};

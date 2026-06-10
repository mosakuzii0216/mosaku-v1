import { useWeeklyMemoCount } from '../../hooks/useHomeDashboardQueries';

export const WeeklyActivitySummary = () => {
	const { data, isLoading, isError, refetch } = useWeeklyMemoCount();

	return (
		<div className="px-4 py-3">
			<h2 className="text-sm font-semibold text-gray-500 mb-1">今週の活動</h2>
			{isLoading && (
				<div
					data-testid="weekly-count-skeleton"
					className="h-7 w-48 bg-gray-100 rounded animate-pulse"
				/>
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
			{!isLoading && !isError && data && (
				<p className="text-xl font-bold text-gray-800">
					{data.count === 0 ? (
						<span className="text-base font-medium text-gray-500">今週はまだ書いていないよ</span>
					) : (
						<>今週 {data.count}個 書いたよ</>
					)}
				</p>
			)}
		</div>
	);
};

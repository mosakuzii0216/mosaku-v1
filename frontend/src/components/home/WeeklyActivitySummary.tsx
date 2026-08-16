import { useWeeklyMemoCount } from '../../hooks/useHomeDashboardQueries';

export const WeeklyActivitySummary = () => {
	const { data, isLoading, isError, refetch } = useWeeklyMemoCount();

	return (
		<div className="px-4 py-3">
			<h2 className="text-sm font-semibold text-[var(--on-surface-variant)] mb-1">今週の活動</h2>
			{isLoading && (
				<div
					data-testid="weekly-count-skeleton"
					className="h-7 w-48 bg-[var(--surface-variant)] rounded animate-pulse"
				/>
			)}
			{isError && (
				<div className="text-sm text-[var(--on-surface-variant)]">
					<p>データを取得できませんでした</p>
					<button onClick={() => refetch()} className="mt-1 text-[var(--accent)] text-sm">
						再試行
					</button>
				</div>
			)}
			{!isLoading && !isError && data && (
				<p className="text-xl font-bold text-[var(--on-surface)]">
					{data.count === 0 ? (
						<span className="text-base font-medium text-[var(--on-surface-variant)]">
							今週はまだ書いていないよ
						</span>
					) : (
						<>今週 {data.count}個 書いたよ</>
					)}
				</p>
			)}
		</div>
	);
};

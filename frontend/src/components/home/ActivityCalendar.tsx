import { useMemo } from 'react';
import { useActivityDates } from '../../hooks/useHomeDashboardQueries';

const toJSTDateString = (date: Date): string => {
	const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
	return jst.toISOString().split('T')[0];
};

const buildLast35Days = (): string[] => {
	const today = new Date();
	const days: string[] = [];
	for (let i = 34; i >= 0; i--) {
		const d = new Date(today);
		d.setDate(today.getDate() - i);
		days.push(toJSTDateString(d));
	}
	return days;
};

export const ActivityCalendar = () => {
	const { from, to } = useMemo(() => {
		const days = buildLast35Days();
		return { from: days[0], to: days[days.length - 1] };
	}, []);

	const { data, isLoading, isError, refetch } = useActivityDates(from, to);

	const days = useMemo(() => buildLast35Days(), []);
	const activeSet = useMemo(() => new Set(data?.dates ?? []), [data]);

	if (isLoading) {
		return (
			<div className="px-4 py-3">
				<h2 className="text-sm font-semibold text-gray-500 mb-2">書いた日</h2>
				<div data-testid="activity-calendar-skeleton" className="grid grid-cols-7 gap-1">
					{Array.from({ length: 35 }).map((_, i) => (
						<div key={i} className="w-6 h-6 bg-gray-100 rounded animate-pulse" />
					))}
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="px-4 py-3">
				<h2 className="text-sm font-semibold text-gray-500 mb-1">書いた日</h2>
				<div className="text-sm text-gray-500">
					<p>データを取得できませんでした</p>
					<button
						onClick={() => refetch()}
						className="mt-1 text-blue-500 hover:text-blue-600 text-sm"
					>
						再試行
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="px-4 py-3">
			<h2 className="text-sm font-semibold text-gray-500 mb-2">書いた日</h2>
			<div className="grid grid-cols-7 gap-1">
				{days.map((day) => {
					const isActive = activeSet.has(day);
					return (
						<div
							key={day}
							data-testid="calendar-cell"
							className="w-6 h-6 flex items-center justify-center"
						>
							{isActive && (
								<span data-testid="active-dot" className="w-3 h-3 rounded-full bg-gray-400" />
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
};

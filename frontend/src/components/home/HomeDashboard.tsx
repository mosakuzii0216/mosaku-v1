import { NewMemoHero } from './NewMemoHero';
import { RecentMemosSection } from './RecentMemosSection';
import { WeeklyActivitySummary } from './WeeklyActivitySummary';
import { ActivityCalendar } from './ActivityCalendar';
import { HomeNotebookSection } from './HomeNotebookSection';
import { DailyPrompt } from './DailyPrompt';

export const HomeDashboard = () => {
	return (
		<div data-testid="home-dashboard" className="flex-1 overflow-y-auto pb-8">
			<NewMemoHero />
			<RecentMemosSection />
			<WeeklyActivitySummary />
			<ActivityCalendar />
			<HomeNotebookSection />
			<DailyPrompt />
		</div>
	);
};

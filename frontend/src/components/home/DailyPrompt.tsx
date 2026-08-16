import { Lightbulb } from 'lucide-react';
import { getDailyPrompt } from '../../constants/dailyPrompts';
import { useNavigation } from '../../hooks/useNavigation';
import { toJSTDateString } from '../../utils/jstDate';

export const DailyPrompt = () => {
	const prompt = getDailyPrompt(toJSTDateString(new Date()));
	const { goToMemoCreateWithTitle } = useNavigation();

	if (!prompt) return null;

	return (
		<div className="px-4 py-3">
			<button
				onClick={() => goToMemoCreateWithTitle(prompt)}
				className="w-full text-left p-3 rounded-xl bg-[var(--surface-variant)] hover:bg-[var(--state-hover)] transition-colors"
			>
				<div className="flex items-center gap-2 mb-1">
					<Lightbulb className="w-3.5 h-3.5 text-[var(--on-surface-variant)]" />
					<span className="text-xs text-[var(--on-surface-variant)] font-medium">今日のお題</span>
				</div>
				<p className="text-sm text-[var(--on-surface)]">{prompt}</p>
			</button>
		</div>
	);
};

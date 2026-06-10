import { Lightbulb } from 'lucide-react';
import { getDailyPrompt } from '../../constants/dailyPrompts';
import { useNavigation } from '../../hooks/useNavigation';

const todayJSTString = (): string => {
	const now = new Date();
	const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
	return jst.toISOString().split('T')[0];
};

export const DailyPrompt = () => {
	const prompt = getDailyPrompt(todayJSTString());
	const { goToMemoCreateWithTitle } = useNavigation();

	if (!prompt) return null;

	return (
		<div className="px-4 py-3">
			<button
				onClick={() => goToMemoCreateWithTitle(prompt)}
				className="w-full text-left p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
			>
				<div className="flex items-center gap-2 mb-1">
					<Lightbulb className="w-3.5 h-3.5 text-gray-400" />
					<span className="text-xs text-gray-400 font-medium">今日のお題</span>
				</div>
				<p className="text-sm text-gray-600">{prompt}</p>
			</button>
		</div>
	);
};

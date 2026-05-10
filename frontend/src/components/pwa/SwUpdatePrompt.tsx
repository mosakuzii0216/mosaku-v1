import { RefreshCw, X } from 'lucide-react';
import { useSwRegistration } from '../../hooks/useSwRegistration';

export const SwUpdatePrompt = () => {
	const { needRefresh, update, dismiss } = useSwRegistration();

	if (!needRefresh) return null;

	return (
		<div
			role="status"
			aria-live="polite"
			className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-xl"
		>
			<div className="flex items-start gap-3">
				<RefreshCw className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" aria-hidden="true" />
				<div className="flex-1">
					<p className="text-sm font-medium text-gray-900">新しいバージョンが利用可能です</p>
					<p className="mt-1 text-xs text-gray-500">
						更新するとアプリが再読み込みされます。あとでにすると、次回起動時に自動で適用されます。
					</p>
					<div className="mt-3 flex gap-2">
						<button
							type="button"
							onClick={() => {
								void update();
							}}
							className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
						>
							更新する
						</button>
						<button
							type="button"
							onClick={dismiss}
							className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
						>
							あとで
						</button>
					</div>
				</div>
				<button
					type="button"
					onClick={dismiss}
					aria-label="閉じる"
					className="text-gray-400 hover:text-gray-600 transition-colors"
				>
					<X className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
};

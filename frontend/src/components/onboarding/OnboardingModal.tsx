import { useOnboardingStore } from '../../stores/useOnboardingStore';
import { useCompleteOnboarding, useSkipOnboarding } from '../../hooks/useOnboardingQueries';
import { ThemeGallery } from './ThemeGallery';

export function OnboardingModal() {
	const isOpen = useOnboardingStore((s) => s.isOpen);
	const selectedThemeId = useOnboardingStore((s) => s.selectedThemeId);

	const { completeOnboarding, isPending: isCompletePending } = useCompleteOnboarding();
	const { skipOnboarding, isPending: isSkipPending } = useSkipOnboarding();

	const isPending = isCompletePending || isSkipPending;

	if (!isOpen) return null;

	return (
		<div
			data-testid="onboarding-backdrop"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="ようこそ mosaku へ"
				className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-8"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="mb-6 text-center">
					<h2 className="text-2xl font-bold text-gray-900 mb-2">ようこそ mosaku へ ✨</h2>
					<p className="text-sm text-gray-500">
						テーマを選んで、あなただけのノートブックを作成しましょう
					</p>
				</div>

				<div className="mb-8">
					<ThemeGallery />
				</div>

				<div className="flex flex-col items-center gap-3">
					<button
						onClick={() => {
							if (selectedThemeId) completeOnboarding(selectedThemeId);
						}}
						disabled={selectedThemeId === null || isPending}
						className="w-full max-w-xs py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
					>
						始める{isCompletePending ? '...' : ''}
					</button>

					{!isPending && (
						<button
							data-testid="skip-link"
							onClick={() => skipOnboarding()}
							className="text-sm text-gray-400 hover:text-gray-600 transition-colors underline-offset-2 hover:underline"
						>
							あとで
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

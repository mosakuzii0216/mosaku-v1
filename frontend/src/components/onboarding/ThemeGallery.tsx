import { useSystemThemes } from '../../hooks/useThemeQueries';
import { useOnboardingStore } from '../../stores/useOnboardingStore';
import { ThemePreviewCard } from './ThemePreviewCard';

const SKELETON_COUNT = 10;

export function ThemeGallery() {
	const { data: themes, isLoading } = useSystemThemes();
	const selectedThemeId = useOnboardingStore((s) => s.selectedThemeId);
	const setSelectedThemeId = useOnboardingStore((s) => s.setSelectedThemeId);

	return (
		<div
			data-testid="theme-gallery-grid"
			className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
		>
			{isLoading || !themes
				? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
						<div
							key={i}
							data-testid="theme-skeleton"
							className="rounded-xl border-2 border-gray-100 bg-gray-100 animate-pulse h-20"
						/>
					))
				: themes.map((theme) => (
						<ThemePreviewCard
							key={theme.id}
							theme={theme}
							isSelected={selectedThemeId === theme.id}
							onSelect={setSelectedThemeId}
						/>
					))}
		</div>
	);
}

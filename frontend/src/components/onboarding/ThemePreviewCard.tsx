import { Check } from 'lucide-react';
import type { Theme } from '../../types/theme';

interface ThemePreviewCardProps {
	theme: Theme;
	isSelected: boolean;
	onSelect: (themeId: string) => void;
}

export function ThemePreviewCard({ theme, isSelected, onSelect }: ThemePreviewCardProps) {
	const previewColor = (theme.metadata?.previewColor as string | undefined) ?? '#6b7280';

	return (
		<button
			data-testid="theme-preview-card"
			onClick={() => onSelect(theme.id)}
			className={[
				'relative flex flex-col items-center gap-2 rounded-xl p-3 border-2 transition-transform duration-200 w-full',
				'hover:scale-105 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.5)]',
				'motion-reduce:hover:scale-100 motion-reduce:transition-none',
				isSelected
					? 'border-blue-500 ring-2 ring-blue-500 ring-offset-2 bg-blue-50'
					: 'border-gray-200 bg-white hover:border-gray-300',
			].join(' ')}
			aria-pressed={isSelected}
			aria-label={theme.name}
		>
			{isSelected && (
				<span
					data-testid="check-mark"
					className="absolute top-1.5 right-1.5 bg-blue-500 text-white rounded-full p-0.5"
				>
					<Check className="w-3 h-3" />
				</span>
			)}
			<div
				data-testid="color-chip"
				className="w-full h-10 rounded-lg"
				style={{ backgroundColor: previewColor }}
			/>
			<span className="text-xs font-medium text-gray-700 text-center leading-tight truncate w-full">
				{theme.name}
			</span>
		</button>
	);
}

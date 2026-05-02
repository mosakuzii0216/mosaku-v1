import type { Tag, MemoTag } from '../../types/tag';

interface TagDisplayProps {
	tags?: MemoTag[];
	size?: 'sm' | 'md' | 'lg';
	maxTags?: number;
	onClick?: (tag: Tag) => void;
}

export const TagDisplay = ({ tags = [], size = 'md', maxTags, onClick }: TagDisplayProps) => {
	const displayTags = maxTags ? tags.slice(0, maxTags) : tags;
	const remainingCount = maxTags && tags.length > maxTags ? tags.length - maxTags : 0;

	const sizeClasses = {
		sm: 'px-2 py-0.5 text-xs',
		md: 'px-2 py-1 text-sm',
		lg: 'px-3 py-1.5 text-base',
	};

	if (tags.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-wrap gap-1">
			{displayTags.map(({ tag }) => (
				<span
					key={tag.id}
					onClick={onClick ? () => onClick(tag) : undefined}
					className={`
            inline-flex items-center rounded-full font-medium text-white
            ${sizeClasses[size]}
            ${onClick ? 'cursor-pointer hover:opacity-80' : ''}
          `}
					style={{ backgroundColor: tag.color || '#6B7280' }}
					title={tag.name}
				>
					{tag.name}
				</span>
			))}

			{remainingCount > 0 && (
				<span
					className={`
          inline-flex items-center rounded-full bg-gray-200 text-gray-600 font-medium
          ${sizeClasses[size]}
        `}
				>
					+{remainingCount}
				</span>
			)}
		</div>
	);
};

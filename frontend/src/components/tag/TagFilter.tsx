import React from 'react';
import { useTagStore } from '../../stores/useTagStore';
import { TagChip } from './TagChip';

interface TagFilterProps {
	className?: string;
}

export const TagFilter: React.FC<TagFilterProps> = ({ className = '' }) => {
	const { tags, selectedTags, toggleTag, clearSelectedTags, isTagSelected, getSelectedTagsData } =
		useTagStore();

	const selectedTagsData = getSelectedTagsData();

	if (tags.length === 0) {
		return null;
	}

	return (
		<div className={`space-y-3 ${className}`}>
			{/* 選択中のタグ */}
			{selectedTags.length > 0 && (
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-medium text-gray-700">
							選択中のタグ ({selectedTags.length})
						</h3>
						<button
							onClick={clearSelectedTags}
							className="text-xs text-blue-600 hover:text-blue-800"
						>
							すべて解除
						</button>
					</div>
					<div className="flex flex-wrap gap-1">
						{selectedTagsData.map((tag) => (
							<TagChip key={tag.id} tag={tag} selected={true} onClick={() => toggleTag(tag.id)} />
						))}
					</div>
				</div>
			)}

			{/* 全タグ一覧 */}
			<div className="space-y-2">
				<h3 className="text-sm font-medium text-gray-700">すべてのタグ</h3>
				<div className="flex flex-wrap gap-1">
					{tags.map((tag) => (
						<TagChip
							key={tag.id}
							tag={tag}
							selected={isTagSelected(tag.id)}
							onClick={() => toggleTag(tag.id)}
						/>
					))}
				</div>
			</div>
		</div>
	);
};

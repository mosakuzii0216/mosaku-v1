import { useState, useRef, useEffect } from 'react';
import { useTagQueries } from '../../hooks/useTagQueries';
import type { Tag } from '../../types/tag';
import { logger } from '../../utils/logger';
import { DEFAULT_TAG_COLORS, FALLBACK_TAG_COLOR } from './tagColors';

interface TagInputProps {
	selectedTags: Tag[];
	onTagsChange: (tags: Tag[]) => void;
	placeholder?: string;
}

export const TagInput = ({
	selectedTags,
	onTagsChange,
	placeholder = 'タグを追加...',
}: TagInputProps) => {
	const [isOpen, setIsOpen] = useState(false);
	const [input, setInput] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const { tagsQuery, createTag, isCreating } = useTagQueries();
	const tags = tagsQuery.data ?? [];

	const filteredTags = tags.filter(
		(tag: Tag) =>
			tag.name.toLowerCase().includes(input.toLowerCase()) &&
			!selectedTags.some((selected) => selected.id === tag.id),
	);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	const handleTagSelect = (tag: Tag) => {
		onTagsChange([...selectedTags, tag]);
		setInput('');
		setIsOpen(false);
	};

	const handleTagRemove = (tagToRemove: Tag) => {
		onTagsChange(selectedTags.filter((tag) => tag.id !== tagToRemove.id));
	};

	const handleCreateTag = async () => {
		if (!input.trim()) return;

		try {
			const randomColor = DEFAULT_TAG_COLORS[Math.floor(Math.random() * DEFAULT_TAG_COLORS.length)];
			const newTag = await createTag({
				name: input.trim(),
				color: randomColor,
			});

			handleTagSelect(newTag);
		} catch (error) {
			logger.error('Failed to create tag:', error);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (filteredTags.length > 0) {
				handleTagSelect(filteredTags[0]);
			} else if (input.trim()) {
				handleCreateTag();
			}
		} else if (e.key === 'Escape') {
			setIsOpen(false);
			setInput('');
		} else if (e.key === 'Backspace' && !input && selectedTags.length > 0) {
			handleTagRemove(selectedTags[selectedTags.length - 1]);
		}
	};

	return (
		<div className="relative" ref={dropdownRef}>
			<div className="flex flex-wrap gap-2 mb-2">
				{selectedTags.map((tag) => (
					<span
						key={tag.id}
						className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium text-white"
						style={{ backgroundColor: tag.color || FALLBACK_TAG_COLOR }}
					>
						{tag.name}
						<button
							type="button"
							onClick={() => handleTagRemove(tag)}
							className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-white/20"
						>
							×
						</button>
					</span>
				))}
			</div>

			<div className="relative">
				<input
					ref={inputRef}
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onFocus={() => setIsOpen(true)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				/>

				{isOpen && (
					<div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
						{filteredTags.map((tag: Tag) => (
							<button
								key={tag.id}
								type="button"
								onClick={() => handleTagSelect(tag)}
								className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
							>
								<span
									className="w-3 h-3 rounded-full"
									style={{ backgroundColor: tag.color || FALLBACK_TAG_COLOR }}
								/>
								{tag.name}
							</button>
						))}

						{input.trim() &&
							!tags.some((tag: Tag) => tag.name.toLowerCase() === input.toLowerCase()) && (
								<button
									type="button"
									onClick={handleCreateTag}
									disabled={isCreating}
									className="w-full px-3 py-2 text-left hover:bg-gray-100 text-blue-600 font-medium border-t border-gray-200"
								>
									+ 「{input}」を作成
								</button>
							)}

						{filteredTags.length === 0 && !input.trim() && (
							<div className="px-3 py-2 text-gray-500 text-center">タグを入力してください</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

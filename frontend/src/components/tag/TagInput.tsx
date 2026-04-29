import { useState, useRef, useEffect } from 'react';
import { useTags, useCreateTag } from '../../hooks/useTagQueries';
import type { Tag } from '../../types/memo';
import { logger } from '../../utils/logger';

interface TagInputProps {
	selectedTags: Tag[];
	onTagsChange: (tags: Tag[]) => void;
	placeholder?: string;
}

const DEFAULT_TAG_COLORS = [
	'#3B82F6',
	'#EF4444',
	'#10B981',
	'#F59E0B',
	'#8B5CF6',
	'#F97316',
	'#06B6D4',
	'#84CC16',
] as const;

export const TagInput = ({
	selectedTags,
	onTagsChange,
	placeholder = 'タグを追加...',
}: TagInputProps) => {
	const [isOpen, setIsOpen] = useState(false);
	const [input, setInput] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const { data: tags = [] } = useTags();
	const createTag = useCreateTag();

	// 検索とフィルタリング
	const filteredTags = tags.filter(
		(tag) =>
			tag.name.toLowerCase().includes(input.toLowerCase()) &&
			!selectedTags.some((selected) => selected.id === tag.id),
	);

	// 外部クリックでドロップダウンを閉じる
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
			const newTag = await createTag.mutateAsync({
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
			{/* 選択されたタグ表示 */}
			<div className="flex flex-wrap gap-2 mb-2">
				{selectedTags.map((tag) => (
					<span
						key={tag.id}
						className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium text-white"
						style={{ backgroundColor: tag.color || '#6B7280' }}
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

			{/* 入力フィールド */}
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

				{/* ドロップダウン */}
				{isOpen && (
					<div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
						{/* 既存タグ */}
						{filteredTags.map((tag) => (
							<button
								key={tag.id}
								type="button"
								onClick={() => handleTagSelect(tag)}
								className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
							>
								<span
									className="w-3 h-3 rounded-full"
									style={{ backgroundColor: tag.color || '#6B7280' }}
								/>
								{tag.name}
							</button>
						))}

						{/* 新規タグ作成 */}
						{input.trim() &&
							!tags.some((tag) => tag.name.toLowerCase() === input.toLowerCase()) && (
								<button
									type="button"
									onClick={handleCreateTag}
									disabled={createTag.isPending}
									className="w-full px-3 py-2 text-left hover:bg-gray-100 text-blue-600 font-medium border-t border-gray-200"
								>
									+ 「{input}」を作成
								</button>
							)}

						{/* 空の状態 */}
						{filteredTags.length === 0 && !input.trim() && (
							<div className="px-3 py-2 text-gray-500 text-center">タグを入力してください</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

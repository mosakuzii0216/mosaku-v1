import React, { useState } from 'react';
import type { CreateTagDto, UpdateTagDto, Tag } from '../../types/tag';

interface TagFormProps {
	tag?: Tag;
	onSubmit: (data: CreateTagDto | UpdateTagDto) => void;
	onCancel: () => void;
	isLoading?: boolean;
}

const PRESET_COLORS = [
	'#FF5733',
	'#33FF57',
	'#3357FF',
	'#FF33F5',
	'#F5FF33',
	'#FF8C33',
	'#33FFF5',
	'#8C33FF',
	'#FF3333',
	'#33FF33',
	'#333FFF',
	'#FF33B8',
	'#B8FF33',
	'#33B8FF',
	'#B833FF',
];

export const TagForm: React.FC<TagFormProps> = ({ tag, onSubmit, onCancel, isLoading = false }) => {
	const [name, setName] = useState(tag?.name || '');
	const [color, setColor] = useState(tag?.color || PRESET_COLORS[0]);
	const [customColor, setCustomColor] = useState('');

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim()) return;

		const finalColor = customColor || color;
		onSubmit({ name: name.trim(), color: finalColor });
	};

	const handleColorSelect = (selectedColor: string) => {
		setColor(selectedColor);
		setCustomColor('');
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div>
				<label htmlFor="tag-name" className="block text-sm font-medium text-gray-700 mb-1">
					タグ名
				</label>
				<input
					id="tag-name"
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
					placeholder="タグ名を入力"
					maxLength={50}
					required
				/>
			</div>

			<div>
				<label className="block text-sm font-medium text-gray-700 mb-2">色</label>

				{/* プリセットカラー */}
				<div className="grid grid-cols-5 gap-2 mb-3">
					{PRESET_COLORS.map((presetColor) => (
						<button
							key={presetColor}
							type="button"
							onClick={() => handleColorSelect(presetColor)}
							className={`w-8 h-8 rounded-full border-2 transition-all ${
								color === presetColor && !customColor
									? 'border-gray-800 scale-110'
									: 'border-gray-300 hover:border-gray-500'
							}`}
							style={{ backgroundColor: presetColor }}
							aria-label={`色を ${presetColor} に設定`}
						/>
					))}
				</div>

				{/* カスタムカラー */}
				<div className="flex items-center gap-2">
					<input
						type="color"
						value={customColor || color}
						onChange={(e) => setCustomColor(e.target.value)}
						className="w-8 h-8 rounded border border-gray-300"
					/>
					<input
						type="text"
						value={customColor || color}
						onChange={(e) => setCustomColor(e.target.value)}
						className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
						placeholder="#FF5733"
						pattern="^#[0-9A-Fa-f]{6}$"
					/>
				</div>
			</div>

			{/* プレビュー */}
			<div>
				<label className="block text-sm font-medium text-gray-700 mb-1">プレビュー</label>
				<div className="p-2 bg-gray-50 rounded">
					<span
						className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border"
						style={{
							backgroundColor: `${customColor || color}20`,
							borderColor: customColor || color,
							color: customColor || color,
						}}
					>
						<span
							className="w-2 h-2 rounded-full"
							style={{ backgroundColor: customColor || color }}
						/>
						{name || 'タグ名'}
					</span>
				</div>
			</div>

			<div className="flex gap-2 pt-4">
				<button
					type="submit"
					disabled={!name.trim() || isLoading}
					className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
				>
					{isLoading ? '保存中...' : tag ? '更新' : '作成'}
				</button>
				<button
					type="button"
					onClick={onCancel}
					disabled={isLoading}
					className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:cursor-not-allowed"
				>
					キャンセル
				</button>
			</div>
		</form>
	);
};

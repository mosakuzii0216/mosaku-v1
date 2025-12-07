import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { Editor } from '@tiptap/react';

interface Range {
	from: number;
	to: number;
}

interface SuggestionProps {
	editor: Editor;
	range: Range;
	query: string;
	text: string;
	clientRect?: (() => DOMRect | null) | null;
}

interface CommandItem {
	title: string;
	description?: string;
	command: (params: SuggestionProps) => void;
	type?: 'base' | 'notebook';
}

interface SlashCommandListProps {
	items: CommandItem[];
	command: (item: CommandItem) => void;
}

interface SlashCommandListRef {
	onKeyDown: ({ event }: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>((props, ref) => {
	const [selectedIndex, setSelectedIndex] = useState(0);

	const selectItem = (index: number) => {
		const item = props.items[index];
		if (item) {
			props.command(item);
		}
	};

	const upHandler = () => {
		setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
	};

	const downHandler = () => {
		setSelectedIndex((selectedIndex + 1) % props.items.length);
	};

	const enterHandler = () => {
		selectItem(selectedIndex);
	};

	useEffect(() => setSelectedIndex(0), [props.items]);

	useImperativeHandle(ref, () => ({
		onKeyDown: ({ event }: { event: KeyboardEvent }) => {
			if (event.key === 'ArrowUp') {
				upHandler();
				return true;
			}

			if (event.key === 'ArrowDown') {
				downHandler();
				return true;
			}

			if (event.key === 'Enter') {
				enterHandler();
				return true;
			}

			return false;
		},
	}));

	return (
		<div className="slash-command-list border rounded-lg shadow-lg bg-white overflow-hidden max-h-80 overflow-y-auto">
			{props.items.length > 0 ? (
				props.items.map((item, index) => (
					<button
						key={index}
						className={`block w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors ${
							index === selectedIndex ? 'bg-blue-50' : ''
						}`}
						onClick={() => selectItem(index)}
					>
						<div className="font-medium text-gray-900">{item.title}</div>
						{item.description && (
							<div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
						)}
					</button>
				))
			) : (
				<div className="px-4 py-2 text-sm text-gray-500">該当するコマンドがありません</div>
			)}
		</div>
	);
});

SlashCommandList.displayName = 'SlashCommandList';

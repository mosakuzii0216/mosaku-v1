import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import type { Instance as TippyInstance } from 'tippy.js';
import { SlashCommandList } from './SlashCommandList';

interface SuggestionProps {
	editor: any;
	range: any;
	query: string;
	text: string;
	clientRect?: (() => DOMRect | null) | null;
}

interface CommandItem {
	title: string;
	description?: string;
	command: (params: any) => void;
	type?: 'base' | 'notebook';
}

// ノートブックデータを外部から注入できるようにするためのグローバル変数
let notebooksData: Array<{ id: string; name: string }> = [];

export const setNotebooksData = (notebooks: Array<{ id: string; name: string }>) => {
	notebooksData = notebooks;
};

export const getSuggestionItems = (query: string): CommandItem[] => {
	// クエリが "notebook" で始まる場合、ノートブック一覧を表示
	if (query.toLowerCase().startsWith('notebook')) {
		const searchTerm = query.slice(8).trim().toLowerCase(); // "notebook" の後の文字列
		return notebooksData
			.filter((nb) => nb.name.toLowerCase().includes(searchTerm))
			.map((nb) => ({
				title: nb.name,
				description: 'ノートブック',
				type: 'notebook' as const,
				command: ({ editor, range }: any) => {
					editor.chain().focus().deleteRange(range).insertContent(`[[${nb.name}]]`).run();
				},
			}));
	}

	// 基本コマンド
	const baseCommands: CommandItem[] = [
		{
			title: 'notebook',
			description: 'ノートブックを挿入',
			type: 'base',
			command: () => {
				// notebook を入力済みの状態にするため、何もしない
				// ユーザーが続けて入力すると自動的にノートブック一覧が表示される
			},
		},
	];

	return baseCommands.filter((item) => item.title.toLowerCase().startsWith(query.toLowerCase()));
};

export const suggestion = {
	items: ({ query }: { query: string }) => {
		return getSuggestionItems(query);
	},

	render: () => {
		let component: ReactRenderer | null = null;
		let popup: TippyInstance[] | null = null;

		return {
			onStart: (props: SuggestionProps) => {
				component = new ReactRenderer(SlashCommandList, {
					props: {
						items: getSuggestionItems(props.query),
						command: (item: CommandItem) => {
							item.command(props);
						},
					},
					editor: props.editor,
				});

				if (!props.clientRect) {
					return;
				}

				popup = tippy('body', {
					getReferenceClientRect: props.clientRect as () => DOMRect,
					appendTo: () => document.body,
					content: component.element,
					showOnCreate: true,
					interactive: true,
					trigger: 'manual',
					placement: 'bottom-start',
				});
			},

			onUpdate(props: SuggestionProps) {
				if (!component) return;

				component.updateProps({
					items: getSuggestionItems(props.query),
					command: (item: CommandItem) => {
						item.command(props);
					},
				});

				if (!props.clientRect || !popup) {
					return;
				}

				popup[0].setProps({
					getReferenceClientRect: props.clientRect as () => DOMRect,
				});
			},

			onKeyDown(props: { event: KeyboardEvent }) {
				if (!popup) return false;

				if (props.event.key === 'Escape') {
					popup[0].hide();
					return true;
				}

				// @ts-ignore - ReactRendererのrefの型が正しく認識されないため
				return component?.ref?.onKeyDown?.(props) || false;
			},

			onExit() {
				if (popup) {
					popup[0].destroy();
				}
				if (component) {
					component.destroy();
				}
			},
		};
	},
};

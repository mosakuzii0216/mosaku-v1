import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import type { Instance as TippyInstance } from 'tippy.js';
import type { Editor } from '@tiptap/react';
import { SlashCommandList, type SlashCommandListRef } from './SlashCommandList';
import {
	getSlashCommandItems,
	getPaletteItems,
	type SlashCommandItem,
	type SlashCommandMode,
	type PaletteTarget,
} from './slashCommandItems';

// ノートブックデータ注入は slashCommandItems へ集約。RichTextEditor の import 契約を維持するため再エクスポート。
export { setNotebooksData } from './slashCommandItems';

interface Range {
	from: number;
	to: number;
}

interface SuggestionProps {
	editor: Editor;
	range: Range;
	query: string;
	clientRect?: (() => DOMRect | null) | null;
}

/**
 * `/` スラッシュコマンドの render。
 *
 * mode（'root' | 'notebook' | 'palette'）を doc に持たせず、この render クロージャが保持する
 * （Req3.5/5.3 の最難所）。
 * - root → notebook: ノートブック参照（kind='notebook'）選択時、doc を変更せず mode を切り替える。
 * - notebook → 確定: 個々のノートブック選択で `[[name]]` を挿入し suggestion を exit する。
 * - notebook → 戻る: 「戻る」操作・Escape・`/` まで消去（query 空）で root へ復帰する（Req3.8）。
 * - root → palette: テキスト色/マーカー（kind='palette'）選択時、doc を変更せず
 *   `item.paletteTarget` を見て palette モードへ遷移する（Req5.3）。
 * - palette → 確定: スウォッチ選択で range 削除＋stored mark 有効化を実行する（Req5.3/5.4）。
 * - palette → 戻る: 「戻る」操作・Escape・`/` まで消去（query 空）で root へ復帰する（notebook と同じ復帰契約）。
 */
export const suggestion = {
	render: () => {
		let component: ReactRenderer<SlashCommandListRef> | null = null;
		let popup: TippyInstance[] | null = null;
		let mode: SlashCommandMode = 'root';
		let paletteTarget: PaletteTarget | null = null;
		let latest: SuggestionProps | null = null;

		function currentItems(query: string): SlashCommandItem[] {
			if (mode === 'palette' && paletteTarget) {
				return getPaletteItems(query, paletteTarget);
			}
			return getSlashCommandItems(query, mode);
		}

		function renderProps(queryOverride?: string) {
			if (!component || !latest) {
				return;
			}
			const q = queryOverride !== undefined ? queryOverride : latest.query;
			component.updateProps({
				items: currentItems(q),
				mode,
				command: handleSelect,
				onBack: backToRoot,
			});
		}

		function backToRoot() {
			if (mode === 'root') {
				return;
			}
			mode = 'root';
			paletteTarget = null;
			// notebook/palette から戻るとき latest.query はサブメニュー検索文字列のままなので
			// root では空クエリ（全件）で表示する
			renderProps('');
		}

		function handleSelect(item: SlashCommandItem) {
			if (!latest) {
				return;
			}
			// root でノートブック参照を選ぶと、挿入も range 削除も行わずサブメニューへ遷移（Req3.5）
			if (mode === 'root' && item.kind === 'notebook') {
				mode = 'notebook';
				renderProps();
				return;
			}
			// root でテキスト色/マーカーを選ぶと、doc を変更せず palette モードへ遷移（Req5.3）
			if (mode === 'root' && item.kind === 'palette' && item.paletteTarget) {
				mode = 'palette';
				paletteTarget = item.paletteTarget;
				renderProps();
				return;
			}
			item.run({ editor: latest.editor, range: latest.range });
		}

		return {
			onStart: (props: SuggestionProps) => {
				mode = 'root';
				paletteTarget = null;
				latest = props;
				component = new ReactRenderer(SlashCommandList, {
					props: {
						items: currentItems(props.query),
						mode,
						command: handleSelect,
						onBack: backToRoot,
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
				latest = props;
				// notebook/palette モードで `/` まで消えた（query 空）ら root へ戻す（Req3.4/3.8/5.3）
				if (mode !== 'root' && props.query === '') {
					mode = 'root';
					paletteTarget = null;
				}
				renderProps();

				if (props.clientRect && popup) {
					popup[0].setProps({
						getReferenceClientRect: props.clientRect as () => DOMRect,
					});
				}
			},

			onKeyDown(props: { event: KeyboardEvent }) {
				if (!popup) {
					return false;
				}

				if (props.event.key === 'Escape') {
					// notebook/palette では root へ戻し、root ではメニューを閉じる（Req3.8/5.3）
					if (mode !== 'root') {
						backToRoot();
						return true;
					}
					popup[0].hide();
					return true;
				}

				return component?.ref?.onKeyDown?.(props) ?? false;
			},

			onExit() {
				mode = 'root';
				paletteTarget = null;
				latest = null;
				if (popup) {
					popup[0].destroy();
					popup = null;
				}
				if (component) {
					component.destroy();
					component = null;
				}
			},
		};
	},
};

import { Extension } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import type { SuggestionOptions } from '@tiptap/suggestion';

export interface SlashCommandOptions {
	/**
	 * `@tiptap/suggestion` へ渡す設定。`createEditorExtensions` から `render` を注入する。
	 * char / allow / items / command 等の本実装は後続タスク（スラッシュコマンドメニュー）が拡張する。
	 */
	suggestion: Partial<SuggestionOptions>;
}

/**
 * `/` トリガーのスラッシュコマンド拡張（土台）。
 *
 * 本ファクトリ（createEditorExtensions）が編集時のみ組み込むための最小実装。
 * Suggestion プラグインを `char:'/'` で起動し、コードブロック内では抑止する（Req3.7 の起点）。
 * コマンド候補（items）・UI・ノートブック参照サブメニューの本実装は後続タスクで追加する。
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
	name: 'slashCommand',

	addOptions() {
		return {
			suggestion: {},
		};
	},

	addProseMirrorPlugins() {
		return [
			Suggestion({
				editor: this.editor,
				char: '/',
				// 空段落・行頭でのみ起動する（Req3.1）。行中の `/` では起動しない
				startOfLine: true,
				// コードブロック内ではスラッシュメニューを起動しない（Req3.7）
				allow: ({ editor }) => !editor.isActive('codeBlock'),
				// 候補は render 層が mode を加味して算出するため、ここでは空でよい
				// （mode は doc を汚さず render クロージャが保持する）
				items: () => [],
				...this.options.suggestion,
			}),
		];
	},
});

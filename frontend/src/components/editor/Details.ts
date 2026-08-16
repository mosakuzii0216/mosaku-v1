import { Details as BaseDetails } from '@tiptap/extension-details';
import { findParentNode } from '@tiptap/core';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		richEditorDetails: {
			/**
			 * カーソル位置に開いた状態のトグル（Details）を挿入する（Req4.1）。
			 * persist:false のため「開いた状態」は doc 属性ではなく NodeView の view-state
			 * （`is-open` クラス・`detailsContent` の `hidden` 属性）でのみ表現される。
			 * 公式 setDetails は常に「閉」で挿入するため、挿入直後にトグルボタンを
			 * プログラム的にクリックして view-state を開状態へ揃える。
			 */
			insertOpenDetails: () => ReturnType;
		};
	}
}

/**
 * 公式 Details（トグル）を extend し、スラッシュ確定時に「開いた状態」で挿入する
 * コマンドを追加する（Task 6 / Req4.1）。ノード定義・NodeView・開閉ロジックそのものは
 * 公式実装をそのまま利用し、editable/persist の方針は Task 1.2 spike の確定（persist:false）
 * を単一情報源へ引き継ぐ。
 */
export const Details = BaseDetails.extend({
	addCommands() {
		return {
			...(this.parent?.() ?? {}),
			insertOpenDetails:
				() =>
				({ editor, dispatch, tr }) => {
					// editor.commands.setDetails() は即時 dispatch されるため、この時点で
					// view が再描画済み（NodeView の DOM が存在する）ことが保証される。
					// can() 判定（dispatch 未提供）時はここで止め、DOM 操作の副作用を起こさない。
					if (!dispatch) {
						return editor.can().setDetails();
					}
					// このコマンドは editor.commands.setDetails() で独立したトランザクションを
					// 即時 dispatch する（DOM を同期的に読むため）。呼び出し元（CommandManager）
					// が保持する素の outer tr は未使用のまま残るため、そのまま dispatch されると
					// 既に進んだ view.state に対して不整合（stale）となる。preventDispatch で
					// outer 側の重複 dispatch を止める（本コマンドは単体呼び出し専用。より大きな
					// chain 内で他コマンドと連結すると、その他コマンド分の変更も揉み消される点に注意）。
					tr.setMeta('preventDispatch', true);
					if (!editor.commands.setDetails()) {
						return false;
					}

					const detailsParent = findParentNode((node) => node.type.name === this.name)(
						editor.state.selection,
					);
					if (!detailsParent) {
						return false;
					}

					const dom = editor.view.nodeDOM(detailsParent.pos) as HTMLElement | null;
					const toggleButton = dom?.querySelector('button');
					toggleButton?.click();

					return true;
				},
		};
	},
});

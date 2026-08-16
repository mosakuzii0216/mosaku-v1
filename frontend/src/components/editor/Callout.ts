import { Node, mergeAttributes, defaultBlockAt } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { CalloutView } from './CalloutView';
import { DEFAULT_CALLOUT_VARIANT } from './calloutVariants';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		callout: {
			/** カーソル位置にコールアウトを挿入する（既定 variant は point）（Req1.1/1.2） */
			setCallout: (variant?: string) => ReturnType;
			/**
			 * コールアウト本文末尾でキャレットを外（直後の新しい段落）へ逃がす（Req1.5）。
			 * 末尾以外では no-op（false）で通常のキー入力へフォールスルーする。
			 */
			exitCalloutAtEnd: () => ReturnType;
		};
	}
}

/**
 * コールアウト（枠付き強調ブロック）ノード。
 *
 * 表示テキスト（アイコン/ラベル）は attrs に持たせず、`variant` 識別子のみを永続化する
 * （Req7.6 の抽出整合）。アイコン/配色は CSS（`data-variant` 属性セレクタ）が解決し、
 * 未知 variant は CSS 側の既定ルールへフォールバックして描画しつつ JSON は保持する
 * （前方互換・Req1.2）。
 */
export const Callout = Node.create({
	name: 'callout',
	group: 'block',
	content: 'block+',
	defining: true,

	addAttributes() {
		return {
			variant: {
				default: DEFAULT_CALLOUT_VARIANT,
				parseHTML: (element: HTMLElement) =>
					element.getAttribute('data-variant') ?? DEFAULT_CALLOUT_VARIANT,
				renderHTML: (attributes: { variant?: string }) => ({
					'data-variant': attributes.variant ?? DEFAULT_CALLOUT_VARIANT,
				}),
			},
		};
	},

	parseHTML() {
		return [{ tag: 'div[data-callout]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0];
	},

	addCommands() {
		return {
			setCallout:
				(variant = DEFAULT_CALLOUT_VARIANT) =>
				({ commands }) => {
					return commands.insertContent({
						type: this.name,
						attrs: { variant },
						content: [{ type: 'paragraph' }],
					});
				},

			// 本文（callout content）末尾でのみ実行され、コールアウトの外（直後の新しい段落）へ
			// キャレットを逃がす（Req1.5）。ProseMirror 標準 exitCode と同じ考え方を
			// カスタムノードの深さ（calloutDepth）に一般化したもの。
			// `dispatch` が渡されないとき（can() 判定時）は tr を変更しない PM の規約に従う。
			exitCalloutAtEnd:
				() =>
				({ state, dispatch }) => {
					const { selection } = state;
					const { $from, empty } = selection;
					if (!empty) {
						return false;
					}

					let calloutDepth = -1;
					for (let d = $from.depth; d > 0; d -= 1) {
						if ($from.node(d).type.name === this.name) {
							calloutDepth = d;
							break;
						}
					}
					if (calloutDepth === -1) {
						return false;
					}

					// キャレットが現在のテキストブロック末尾（$from.end() は既定で $from.depth を指す）
					// かつ、その分岐先の子がコールアウトの最後の子であることの両方を満たすときのみ
					// 脱出する。これにより「1行目の末尾（末尾段落ではない）」では発火しない。
					const atEndOfTextblock = $from.pos === $from.end();
					const isLastChildOfCallout =
						$from.indexAfter(calloutDepth) === $from.node(calloutDepth).childCount;
					if (!atEndOfTextblock || !isLastChildOfCallout) {
						return false;
					}

					const pos = $from.after(calloutDepth);
					// StarterKit 標準 TrailingNode が「doc 末尾が非デフォルト型ノード（callout 等）の
					// ときトランザクションのたびに末尾へ空段落を自動挿入する」ため、コールアウトが
					// doc 末尾にある場合はこの時点で既に直後の段落が存在し得る。既存ノードがあれば
					// それを再利用し、無ければ新規に既定ブロックを挿入する（二重挿入の回避）。
					const nodeAfter = state.doc.nodeAt(pos);
					let tr = state.tr;

					if (!nodeAfter) {
						const above = $from.node(calloutDepth - 1);
						const afterIndex = $from.indexAfter(calloutDepth - 1);
						const type = defaultBlockAt(above.contentMatchAt(afterIndex));
						if (!type || !above.canReplaceWith(afterIndex, afterIndex, type)) {
							return false;
						}
						tr = tr.replaceWith(pos, pos, type.createAndFill()!);
					}

					if (dispatch) {
						tr.setSelection(Selection.near(tr.doc.resolve(pos), 1));
						dispatch(tr.scrollIntoView());
					}
					return true;
				},
		};
	},

	addKeyboardShortcuts() {
		return {
			ArrowDown: () => this.editor.commands.exitCalloutAtEnd(),
			'Mod-Enter': () => this.editor.commands.exitCalloutAtEnd(),
		};
	},

	addNodeView() {
		return ReactNodeViewRenderer(CalloutView);
	},
});

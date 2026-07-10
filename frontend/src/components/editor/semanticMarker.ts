import { Highlight } from '@tiptap/extension-highlight';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		semanticMarker: {
			/** 選択範囲へセマンティックカラー名のマーカー（蛍光ペン）を適用する（Req2.2/2.5） */
			setMarker: (name: string) => ReturnType;
			/** マーカーを除去して既定の表示へ戻す（Req2.4） */
			unsetMarker: () => ReturnType;
		};
	}
}

/**
 * Highlight を extend し、`multicolor` の hex 属性をセマンティックカラー名の `marker`
 * 属性へ置換する。生 hex/`background-color` は出力・復元しない（Req2.5）。
 */
export const SemanticMarker = Highlight.extend({
	addAttributes() {
		return {
			marker: {
				default: null,
				parseHTML: (element: HTMLElement) => element.getAttribute('data-marker'),
				renderHTML: (attributes: { marker?: string | null }) => {
					if (!attributes.marker) {
						return {};
					}
					return { 'data-marker': attributes.marker };
				},
			},
		};
	},

	addCommands() {
		return {
			...this.parent?.(),
			setMarker:
				(name: string) =>
				({ commands }) => {
					return commands.setMark(this.name, { marker: name });
				},
			unsetMarker:
				() =>
				({ commands }) => {
					return commands.unsetMark(this.name);
				},
		};
	},
});

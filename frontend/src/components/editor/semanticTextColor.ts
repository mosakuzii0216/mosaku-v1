import { TextStyle } from '@tiptap/extension-text-style';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		semanticTextColor: {
			/** 選択範囲へセマンティックカラー名のテキスト色を適用する（Req2.1/2.5） */
			setTextColor: (name: string) => ReturnType;
			/** テキスト色を除去して既定の表示へ戻す（Req2.4） */
			unsetTextColor: () => ReturnType;
		};
	}
}

/**
 * TextStyle を extend し、セマンティックカラー名のみを `textColor` 属性として保持する。
 * 生 hex の `style="color:…"` は出力・復元しない（Req2.5）。公式 Color/BackgroundColor
 * サブ拡張は登録しないため、`textStyle` マークの属性はこの `textColor` のみとなる。
 */
export const SemanticTextColor = TextStyle.extend({
	addAttributes() {
		return {
			...(this.parent?.() ?? {}),
			textColor: {
				default: null,
				parseHTML: (element: HTMLElement) => element.getAttribute('data-text-color'),
				renderHTML: (attributes: { textColor?: string | null }) => {
					if (!attributes.textColor) {
						return {};
					}
					return { 'data-text-color': attributes.textColor };
				},
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: 'span',
				consuming: false,
				// 親 TextStyle は style 属性の有無のみで判定するため、data-text-color のみを
				// 持つ span（生 hex を出力しない本拡張の出力）も一致するよう条件を広げる
				getAttrs: (element: HTMLElement) => {
					const hasStyle = element.hasAttribute('style');
					const hasTextColor = element.hasAttribute('data-text-color');
					if (!hasStyle && !hasTextColor) {
						return false;
					}
					return {};
				},
			},
		];
	},

	addCommands() {
		return {
			...(this.parent?.() ?? {}),
			setTextColor:
				(name: string) =>
				({ chain }) => {
					return chain().setMark(this.name, { textColor: name }).run();
				},
			unsetTextColor:
				() =>
				({ chain }) => {
					return chain().setMark(this.name, { textColor: null }).removeEmptyTextStyle().run();
				},
		};
	},
});

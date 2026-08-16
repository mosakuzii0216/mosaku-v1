// vitest グローバルセットアップ。
//
// jsdom の Range は getClientRects/getBoundingClientRect を実装しない（実ブラウザのみ提供）。
// EditorBubbleMenu（Task 8）が使う floating-ui 位置計算が ProseMirror の coordsAtPos 経由で
// Range 由来の矩形を要求するため、RichTextEditor をマウントする全テストに影響する。
// テスト環境限定のスタブであり本番コードには影響しない。
if (typeof Range.prototype.getBoundingClientRect !== 'function') {
	Range.prototype.getBoundingClientRect = function (): DOMRect {
		return {
			top: 0,
			left: 0,
			right: 0,
			bottom: 0,
			width: 0,
			height: 0,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect;
	};
}
if (typeof Range.prototype.getClientRects !== 'function') {
	Range.prototype.getClientRects = function (): DOMRectList {
		return [] as unknown as DOMRectList;
	};
}

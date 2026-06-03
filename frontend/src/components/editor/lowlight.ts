import { createLowlight, common } from 'lowlight';

/**
 * エディタ・公開表示で共有する lowlight インスタンス。
 *
 * モジュールスコープで1度だけ生成し、編集（RichTextEditor）と公開表示
 * （PublicMemoRenderer）の双方が同一インスタンスを参照することで、
 * 保存 HTML のコードブロックを同じ言語サブセットで再ハイライトできる。
 *
 * 言語は lowlight の `common` サブセット（js/ts/json/xml(html)/css/bash/shell/
 * python/sql/markdown/diff 等 37 言語）を register する。未登録言語が指定された
 * 場合は CodeBlockLowlight が `highlightAuto` へフォールバックするため例外は発生せず、
 * 実質プレーンに近い描画となる（design.md Error Handling 参照）。
 */
export const lowlight = createLowlight(common);

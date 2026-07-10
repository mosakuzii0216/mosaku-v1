import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details';
import { TableKit } from '@tiptap/extension-table';
import type { Extensions } from '@tiptap/react';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { lowlight } from './lowlight';
import { SlashCommand } from './slashCommand';
import { SemanticTextColor } from './semanticTextColor';
import { SemanticMarker } from './semanticMarker';
import { Callout } from './Callout';
import './codeHighlight.css';
import './callout.css';
import './table.css';

export interface SlashOptions {
	/** SlashCommand 拡張へ渡す suggestion の render（ポップアップ描画） */
	render: SuggestionOptions['render'];
}

export interface EditorExtensionOptions {
	/** true: 編集（Placeholder/Slash/TaskItem トグル有効） / false: 公開表示 */
	editable: boolean;
	/** 編集時の placeholder テキスト（editable=true のときのみ使用） */
	placeholder?: string;
	/** 編集時のスラッシュコマンド設定（editable=true のときのみ使用） */
	slash?: SlashOptions;
}

/**
 * 編集（RichTextEditor）・公開表示（PublicMemoRenderer）で共有する拡張セットの単一情報源。
 *
 * ノード定義（CodeBlockLowlight / TaskList / TaskItem / Link / HorizontalRule など）は
 * `editable` に依らず完全一致させ、保存 HTML の往復一致を構造的に担保する（Req9.4）。
 * editable による差分は Placeholder / SlashCommand の有無と、Link の openOnClick・StarterKit
 * trailingNode の出し分けのみ。TaskItem の読み取り専用化はエディタ側の `editable:false` が
 * 自動制御するため拡張側の差分は不要。
 */
export function createEditorExtensions(options: EditorExtensionOptions): Extensions {
	const { editable, placeholder, slash } = options;

	const extensions: Extensions = [
		StarterKit.configure({
			// 見出しは H1〜H3 に限定（Req2.1）
			heading: { levels: [1, 2, 3] },
			// StarterKit 標準の codeBlock を無効化し Lowlight 版へ差し替える（Req4.1/4.3）
			codeBlock: false,
			// リンク自動化とセキュリティ設定（Req7.1/7.2/7.3）
			link: {
				autolink: true,
				linkOnPaste: true,
				// 編集中はクリック遷移させず、公開表示ではクリックで遷移する
				openOnClick: !editable,
				// javascript: 等の危険スキームを排除（http/https/mailto に限定）
				protocols: ['http', 'https', 'mailto'],
				// Req7.3（リンク範囲を後続テキストへ拡張しない）は autolink プラグインが
				// リンク境界を管理するため、本版では独立した inclusive オプションを持たない。
				HTMLAttributes: {
					rel: 'noopener noreferrer nofollow',
					target: '_blank',
				},
			},
			// StarterKit 標準 TrailingNode は「doc 末尾が atom 的ノード（table/details/callout 等）の
			// ときトランザクション発行のたびに末尾へ空段落を自動挿入する」編集専用の UX 補助であり、
			// editable に関わらず appendTransaction が走る（内部で editable を判定しない）。
			// 公開ビュー（editable:false）で放置すると、トグル開閉クリックが内部で呼ぶ
			// editor.commands.focus() の選択トランザクションを起点に doc 構造が変わってしまい
			// Req6.4（公開ビューは開閉以外の編集操作を受け付けない）に反する（Task 1.2 spike で発見）。
			// 読み取り専用ビューでは「末尾の先へ入力する」UX 自体が不要なため無効化する。
			trailingNode: editable ? undefined : false,
		}),
		// コードブロック構文ハイライト（編集・公開で共有する lowlight インスタンス）（Req4.3/4.5）
		CodeBlockLowlight.configure({ lowlight }),
		// チェックリスト（Req5.1〜5.4）。ノード定義は編集・公開で一致させる
		TaskList,
		TaskItem.configure({ nested: true }),
		// トグル（Req4.1〜4.4）。persist:false により開閉は NodeView の view-state のみで
		// doc トランザクションを発行しない。editable:false（公開ビュー）でも開閉が動く
		// （research.md「Details の公開ビュー開閉と persist の選択」参照）。
		Details.configure({ persist: false }),
		DetailsSummary,
		DetailsContent,
		// テキスト色（Req2.1/2.4〜2.6）。TextStyle を extend しセマンティック名のみを
		// data-text-color として保存する。公式 Color/BackgroundColor は登録しない。
		SemanticTextColor,
		// マーカー（Req2.2/2.4〜2.6）。Highlight を extend しセマンティック名のみを
		// data-marker として保存する（multicolor の hex 属性は置換）。
		SemanticMarker,
		// コールアウト（Req1.1〜1.7）。variant のみを永続属性として保持し、表示テキスト
		// （アイコン/ラベル）は attrs に持たせない（Req7.6）。NodeView は種別変更・削除の
		// 操作 UI のみを担い、editable 非依存で登録する。
		Callout,
		// 表（Req3.1〜3.6）。resizable:false のため列リサイズ用 NodeView は使用せず、
		// renderHTML が editable に依らず常に `.tableWrapper` で表を包む。横スクロール
		// （Req3.6）は table.css の `.tableWrapper { overflow-x:auto }` が編集・公開
		// 両スコープへ適用する。Tab/Shift-Tab によるセル移動は TableKit 標準 keymap。
		TableKit.configure({ table: { resizable: false, renderWrapper: true } }),
	];

	if (editable) {
		if (placeholder !== undefined) {
			extensions.push(Placeholder.configure({ placeholder }));
		}
		if (slash) {
			extensions.push(SlashCommand.configure({ suggestion: { render: slash.render } }));
		}
	}

	return extensions;
}

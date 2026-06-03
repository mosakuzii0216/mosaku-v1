import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import type { Extensions } from '@tiptap/react';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { lowlight } from './lowlight';
import { SlashCommand } from './slashCommand';
import './codeHighlight.css';

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
 * editable による差分は Placeholder / SlashCommand の有無と、Link の openOnClick の出し分けのみ。
 * TaskItem の読み取り専用化はエディタ側の `editable:false` が自動制御するため拡張側の差分は不要。
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
		}),
		// コードブロック構文ハイライト（編集・公開で共有する lowlight インスタンス）（Req4.3/4.5）
		CodeBlockLowlight.configure({ lowlight }),
		// チェックリスト（Req5.1〜5.4）。ノード定義は編集・公開で一致させる
		TaskList,
		TaskItem.configure({ nested: true }),
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

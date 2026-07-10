import { useEditor, EditorContent, type JSONContent } from '@tiptap/react';
import { createEditorExtensions } from '../editor/createEditorExtensions';

interface PublicMemoRendererProps {
	content: JSONContent;
}

export const PublicMemoRenderer: React.FC<PublicMemoRendererProps> = ({ content }) => {
	const editor = useEditor({
		// 編集側（RichTextEditor）と同一のノード定義で描画し、往復一致を担保する（Req5.2）
		extensions: createEditorExtensions({ editable: false }),
		content,
		editable: false,
		editorProps: {
			attributes: {
				// pointer-events-none は付与しない。トグル開閉（view-state）とリンク遷移
				// （openOnClick）を公開ビューで動かすため（Req4.5）。編集拒否は `editable: false`
				// が構造的に保証する（Req4.4/6.4）。許可する操作は (a) トグル開閉 (b) リンク遷移
				// (c) テキスト選択の3つのみ（design.md「公開ビューで許可する操作の一覧」）。
				class:
					'prose prose-sm sm:prose-base lg:prose-lg xl:prose-xl mx-auto p-4 text-gray-900 select-text',
			},
		},
	});

	if (!editor) {
		return null;
	}

	return (
		<div className="public-memo-renderer">
			<EditorContent editor={editor} />
		</div>
	);
};

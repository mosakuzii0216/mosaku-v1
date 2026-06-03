import { useEditor, EditorContent } from '@tiptap/react';
import { createEditorExtensions } from '../editor/createEditorExtensions';

interface PublicMemoRendererProps {
	content: string;
}

export const PublicMemoRenderer: React.FC<PublicMemoRendererProps> = ({ content }) => {
	const editor = useEditor({
		// 編集側（RichTextEditor）と同一のノード定義で描画し、保存 HTML の往復一致を担保する（Req9.4）
		extensions: createEditorExtensions({ editable: false }),
		content,
		editable: false,
		editorProps: {
			attributes: {
				class:
					'prose prose-sm sm:prose-base lg:prose-lg xl:prose-xl mx-auto p-4 text-gray-900 pointer-events-none select-text',
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

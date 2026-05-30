import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

interface PublicMemoRendererProps {
	content: string;
}

export const PublicMemoRenderer: React.FC<PublicMemoRendererProps> = ({ content }) => {
	const editor = useEditor({
		extensions: [StarterKit],
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

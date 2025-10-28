import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

interface RichTextEditorProps {
	content: string;
	onChange: (content: string) => void;
	placeholder?: string;
	className?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
	content,
	onChange,
	placeholder = 'メモを入力...',
	className = '',
}) => {
	const editor = useEditor({
		extensions: [
			StarterKit,
			Placeholder.configure({
				placeholder,
			}),
		],
		content,
		onUpdate: ({ editor }) => {
			onChange(editor.getHTML());
		},
		editorProps: {
			attributes: {
				class:
					'prose prose-sm sm:prose-base lg:prose-lg xl:prose-xl mx-auto focus:outline-none min-h-full p-4 text-gray-900 dark:text-white dark:prose-invert',
			},
		},
	});

	React.useEffect(() => {
		if (editor && content !== editor.getHTML()) {
			editor.commands.setContent(content);
		}
	}, [content, editor]);

	if (!editor) {
		return null;
	}

	return (
		<div className={`rich-text-editor ${className}`}>
			<div className="border-b border-gray-200 dark:border-gray-600 p-2 bg-gray-50 dark:bg-gray-800">
				<div className="flex space-x-1">
					<button
						onClick={() => editor.chain().focus().toggleBold().run()}
						disabled={!editor.can().chain().focus().toggleBold().run()}
						className={`px-3 py-1 text-sm rounded ${
							editor.isActive('bold')
								? 'bg-blue-500 text-white'
								: 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
						} hover:bg-blue-500 hover:text-white disabled:opacity-50`}
					>
						太字
					</button>
					<button
						onClick={() => editor.chain().focus().toggleItalic().run()}
						disabled={!editor.can().chain().focus().toggleItalic().run()}
						className={`px-3 py-1 text-sm rounded ${
							editor.isActive('italic')
								? 'bg-blue-500 text-white'
								: 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
						} hover:bg-blue-500 hover:text-white disabled:opacity-50`}
					>
						斜体
					</button>
					<button
						onClick={() => editor.chain().focus().toggleStrike().run()}
						disabled={!editor.can().chain().focus().toggleStrike().run()}
						className={`px-3 py-1 text-sm rounded ${
							editor.isActive('strike')
								? 'bg-blue-500 text-white'
								: 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
						} hover:bg-blue-500 hover:text-white disabled:opacity-50`}
					>
						取消線
					</button>
					<button
						onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
						className={`px-3 py-1 text-sm rounded ${
							editor.isActive('heading', { level: 1 })
								? 'bg-blue-500 text-white'
								: 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
						} hover:bg-blue-500 hover:text-white`}
					>
						H1
					</button>
					<button
						onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
						className={`px-3 py-1 text-sm rounded ${
							editor.isActive('heading', { level: 2 })
								? 'bg-blue-500 text-white'
								: 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
						} hover:bg-blue-500 hover:text-white`}
					>
						H2
					</button>
					<button
						onClick={() => editor.chain().focus().toggleBulletList().run()}
						className={`px-3 py-1 text-sm rounded ${
							editor.isActive('bulletList')
								? 'bg-blue-500 text-white'
								: 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
						} hover:bg-blue-500 hover:text-white`}
					>
						・リスト
					</button>
					<button
						onClick={() => editor.chain().focus().toggleOrderedList().run()}
						className={`px-3 py-1 text-sm rounded ${
							editor.isActive('orderedList')
								? 'bg-blue-500 text-white'
								: 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
						} hover:bg-blue-500 hover:text-white`}
					>
						1.リスト
					</button>
					<button
						onClick={() => editor.chain().focus().toggleBlockquote().run()}
						className={`px-3 py-1 text-sm rounded ${
							editor.isActive('blockquote')
								? 'bg-blue-500 text-white'
								: 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
						} hover:bg-blue-500 hover:text-white`}
					>
						引用
					</button>
				</div>
			</div>
			<div className="flex-1 bg-white dark:bg-gray-900">
				<EditorContent editor={editor} className="min-h-[200px]" />
			</div>
		</div>
	);
};

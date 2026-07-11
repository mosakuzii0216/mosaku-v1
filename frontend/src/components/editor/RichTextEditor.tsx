import React from 'react';
import { useEditor, EditorContent, type JSONContent } from '@tiptap/react';
import { createEditorExtensions } from './createEditorExtensions';
import { decideContentSync } from './contentSync';
import { suggestion, setNotebooksData } from './suggestion';
import { EditorBubbleMenu } from './EditorBubbleMenu';
import { useNotebooks } from '../../hooks/useNotebookQueries';
import { useEditorFocusStore } from '../../stores/useEditorFocusStore';
import { createEmptyDoc } from '../../utils/editor/prosemirrorText';

interface RichTextEditorProps {
	content: JSONContent;
	onChange: (content: JSONContent) => void;
	placeholder?: string;
	className?: string;
	autofocus?: boolean;
	focusKey?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
	content,
	onChange,
	placeholder = 'メモを入力...',
	className = '',
	autofocus = false,
	focusKey,
}) => {
	const { data: notebooks = [] } = useNotebooks();

	React.useEffect(() => {
		const validNotebooks = notebooks
			.filter((nb): nb is typeof nb & { name: string } => nb.name !== null)
			.map((nb) => ({ id: nb.id, name: nb.name }));
		setNotebooksData(validNotebooks);
	}, [notebooks]);

	const setEditorFocused = useEditorFocusStore((s) => s.setEditorFocused);

	// 直近に onUpdate で emit した JSON を保持し、自己エコーの再適用を防ぐ（Req3.3 / 8.2）
	const lastEmittedRef = React.useRef<JSONContent>(content ?? createEmptyDoc());

	const extensions = React.useMemo(
		() =>
			createEditorExtensions({
				editable: true,
				placeholder,
				slash: { render: suggestion.render },
			}),
		[placeholder],
	);

	const editor = useEditor({
		extensions,
		content: content ?? createEmptyDoc(),
		autofocus,
		onUpdate: ({ editor }) => {
			// emit した JSON を ref に記録してから onChange を発火（自己エコー判定の真実源泉）
			const json = editor.getJSON();
			lastEmittedRef.current = json;
			onChange(json);
		},
		onFocus: () => {
			setEditorFocused(true);
		},
		onBlur: () => {
			setEditorFocused(false);
		},
		editorProps: {
			attributes: {
				class:
					'prose prose-sm sm:prose-base lg:prose-lg xl:prose-xl mx-auto focus:outline-none min-h-full p-4 text-gray-900',
			},
		},
	});

	React.useEffect(() => {
		return () => {
			setEditorFocused(false);
		};
	}, [setEditorFocused]);

	// content 同期（echo-ref 方式）。
	// タイプ中の自己エコー・等価は再適用せず、外部変更（別メモ切替・新規作成・サーバー再取得）の
	// ときだけ emitUpdate:false で反映する。input rule の巻き戻し（Req3.3）と
	// 外部反映による自動保存ループ（Req8.2）の双方を防ぐ。
	React.useEffect(() => {
		if (!editor) {
			return;
		}
		const decision = decideContentSync({
			content: content ?? createEmptyDoc(),
			lastEmitted: lastEmittedRef.current,
			currentJson: editor.getJSON(),
		});
		if (decision === 'apply') {
			editor.commands.setContent(content ?? createEmptyDoc(), { emitUpdate: false });
			lastEmittedRef.current = content ?? createEmptyDoc();
		}
	}, [content, editor]);

	const prevFocusKeyRef = React.useRef<string | undefined>(undefined);
	React.useEffect(() => {
		if (editor && focusKey !== undefined && focusKey !== prevFocusKeyRef.current) {
			prevFocusKeyRef.current = focusKey;
			editor.commands.focus('end');
		}
	}, [focusKey, editor]);

	if (!editor) {
		return null;
	}

	return (
		<div className={`rich-text-editor ${className}`}>
			<div className="border-b border-gray-200 p-2">
				<div className="flex space-x-1">
					<button
						onClick={() => editor.chain().focus().toggleBold().run()}
						disabled={!editor.can().chain().focus().toggleBold().run()}
						className={`px-3 py-1 text-sm rounded ${
							editor.isActive('bold')
								? 'bg-blue-500 text-white'
								: 'bg-white text-gray-700 border border-gray-300'
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
								: 'bg-white text-gray-700 border border-gray-300'
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
								: 'bg-white text-gray-700 border border-gray-300'
						} hover:bg-blue-500 hover:text-white disabled:opacity-50`}
					>
						取消線
					</button>
					<button
						onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
						className={`px-3 py-1 text-sm rounded ${
							editor.isActive('heading', { level: 1 })
								? 'bg-blue-500 text-white'
								: 'bg-white text-gray-700 border border-gray-300'
						} hover:bg-blue-500 hover:text-white`}
					>
						H1
					</button>
					<button
						onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
						className={`px-3 py-1 text-sm rounded ${
							editor.isActive('heading', { level: 2 })
								? 'bg-blue-500 text-white'
								: 'bg-white text-gray-700 border border-gray-300'
						} hover:bg-blue-500 hover:text-white`}
					>
						H2
					</button>
					<button
						onClick={() => editor.chain().focus().toggleBulletList().run()}
						className={`px-3 py-1 text-sm rounded ${
							editor.isActive('bulletList')
								? 'bg-blue-500 text-white'
								: 'bg-white text-gray-700 border border-gray-300'
						} hover:bg-blue-500 hover:text-white`}
					>
						・リスト
					</button>
					<button
						onClick={() => editor.chain().focus().toggleOrderedList().run()}
						className={`px-3 py-1 text-sm rounded ${
							editor.isActive('orderedList')
								? 'bg-blue-500 text-white'
								: 'bg-white text-gray-700 border border-gray-300'
						} hover:bg-blue-500 hover:text-white`}
					>
						1.リスト
					</button>
					<button
						onClick={() => editor.chain().focus().toggleBlockquote().run()}
						className={`px-3 py-1 text-sm rounded ${
							editor.isActive('blockquote')
								? 'bg-blue-500 text-white'
								: 'bg-white text-gray-700 border border-gray-300'
						} hover:bg-blue-500 hover:text-white`}
					>
						引用
					</button>
				</div>
			</div>
			<div className="flex-1">
				<EditorContent editor={editor} className="min-h-[200px]" />
				<EditorBubbleMenu editor={editor} />
			</div>
		</div>
	);
};

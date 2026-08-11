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
					'prose prose-sm sm:prose-base lg:prose-lg xl:prose-xl mx-auto focus:outline-none min-h-full p-4',
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

	// 完全同型の書式ボタン8個を1箇所で組み立てる。押下状態の表現は CSS 側
	// （.shell-button[aria-pressed='true']）へ委ね、ここでは aria-pressed のみを渡す
	// （editor-surface-tokenization 2.2, 2.3）。disabled は現行どおり editor.can()... から
	// 与える（bold/italic/strike のみが対象という現行挙動を変更しない）。
	const toolbarButtons: Array<{
		label: string;
		isActive: boolean;
		disabled?: boolean;
		onClick: () => void;
	}> = [
		{
			label: '太字',
			isActive: editor.isActive('bold'),
			disabled: !editor.can().chain().focus().toggleBold().run(),
			onClick: () => editor.chain().focus().toggleBold().run(),
		},
		{
			label: '斜体',
			isActive: editor.isActive('italic'),
			disabled: !editor.can().chain().focus().toggleItalic().run(),
			onClick: () => editor.chain().focus().toggleItalic().run(),
		},
		{
			label: '取消線',
			isActive: editor.isActive('strike'),
			disabled: !editor.can().chain().focus().toggleStrike().run(),
			onClick: () => editor.chain().focus().toggleStrike().run(),
		},
		{
			label: 'H1',
			isActive: editor.isActive('heading', { level: 1 }),
			onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
		},
		{
			label: 'H2',
			isActive: editor.isActive('heading', { level: 2 }),
			onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
		},
		{
			label: '・リスト',
			isActive: editor.isActive('bulletList'),
			onClick: () => editor.chain().focus().toggleBulletList().run(),
		},
		{
			label: '1.リスト',
			isActive: editor.isActive('orderedList'),
			onClick: () => editor.chain().focus().toggleOrderedList().run(),
		},
		{
			label: '引用',
			isActive: editor.isActive('blockquote'),
			onClick: () => editor.chain().focus().toggleBlockquote().run(),
		},
	];

	return (
		<div className={`rich-text-editor ${className}`}>
			<div className="border-b border-[var(--outline)] p-2">
				<div className="flex space-x-1">
					{toolbarButtons.map((btn) => (
						<button
							key={btn.label}
							onClick={btn.onClick}
							disabled={btn.disabled}
							aria-pressed={btn.isActive}
							className="shell-button px-3 py-1 text-sm rounded"
						>
							{btn.label}
						</button>
					))}
				</div>
			</div>
			<div className="flex-1">
				<EditorContent editor={editor} className="min-h-[200px]" />
				<EditorBubbleMenu editor={editor} />
			</div>
		</div>
	);
};

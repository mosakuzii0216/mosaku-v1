import React from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useEditorState, type Editor } from '@tiptap/react';
import type { EditorState } from '@tiptap/pm/state';
import { TEXT_COLOR_SWATCHES, MARKER_SWATCHES } from './semanticPalette';
import { CALLOUT_VARIANTS } from './calloutVariants';

interface EditorBubbleMenuProps {
	editor: Editor;
}

const SWATCH_BUTTON_CLASS = 'shell-button px-2 py-1 text-sm rounded';

function shouldShow({ editor, state }: { editor: Editor; state: EditorState }): boolean {
	if (!editor.isEditable) {
		return false;
	}
	if (!state.selection.empty) {
		return true;
	}
	return editor.isActive('table') || editor.isActive('callout');
}

/**
 * 選択時バブルメニュー（Task 8）。
 *
 * - テキスト選択時: セマンティック色/マーカーのスウォッチと「デフォルトに戻す」（Req2.1/2.2/2.4）。
 * - キャレットが表内: 行/列の追加・削除・表全体削除（Req3.3/3.4）。
 * - キャレットがコールアウト内: 種別変更（NodeView 内蔵と併存・Req1.3）。
 *
 * 表示は選択/キャレット文脈から純粋導出し doc に UI 状態を持たせない。`editable=true` の
 * 編集面にのみ `RichTextEditor` からマウントする（公開ビューには載せない・Req6.4）。
 */
export const EditorBubbleMenu: React.FC<EditorBubbleMenuProps> = ({ editor }) => {
	const context = useEditorState({
		editor,
		selector: ({ editor }) => ({
			hasSelection: !editor.state.selection.empty,
			inTable: editor.isActive('table'),
			inCallout: editor.isActive('callout'),
			calloutVariant:
				(editor.getAttributes('callout').variant as string | null | undefined) ?? null,
		}),
	});

	if (!context) {
		return null;
	}

	return (
		<BubbleMenu
			editor={editor}
			shouldShow={shouldShow}
			updateDelay={0}
			className="shell-popover flex gap-1 p-1"
		>
			{context.hasSelection && (
				<div className="flex flex-wrap gap-1" role="group" aria-label="テキスト色/マーカー">
					{TEXT_COLOR_SWATCHES.map((s) => (
						<button
							key={`text-${s.name}`}
							type="button"
							className={SWATCH_BUTTON_CLASS}
							onClick={() => editor.chain().focus().setTextColor(s.name).run()}
						>
							{s.label}
						</button>
					))}
					{MARKER_SWATCHES.map((s) => (
						<button
							key={`marker-${s.name}`}
							type="button"
							className={SWATCH_BUTTON_CLASS}
							onClick={() => editor.chain().focus().setMarker(s.name).run()}
						>
							{s.label}
						</button>
					))}
					<button
						type="button"
						className={SWATCH_BUTTON_CLASS}
						onClick={() => editor.chain().focus().unsetTextColor().unsetMarker().run()}
					>
						デフォルトに戻す
					</button>
				</div>
			)}
			{context.inTable && (
				<div className="flex flex-wrap gap-1" role="group" aria-label="表の操作">
					<button
						type="button"
						className={SWATCH_BUTTON_CLASS}
						disabled={!editor.can().chain().focus().addRowBefore().run()}
						onClick={() => editor.chain().focus().addRowBefore().run()}
					>
						行を上に追加
					</button>
					<button
						type="button"
						className={SWATCH_BUTTON_CLASS}
						disabled={!editor.can().chain().focus().addRowAfter().run()}
						onClick={() => editor.chain().focus().addRowAfter().run()}
					>
						行を下に追加
					</button>
					<button
						type="button"
						className={SWATCH_BUTTON_CLASS}
						disabled={!editor.can().chain().focus().deleteRow().run()}
						onClick={() => editor.chain().focus().deleteRow().run()}
					>
						行を削除
					</button>
					<button
						type="button"
						className={SWATCH_BUTTON_CLASS}
						disabled={!editor.can().chain().focus().addColumnBefore().run()}
						onClick={() => editor.chain().focus().addColumnBefore().run()}
					>
						列を左に追加
					</button>
					<button
						type="button"
						className={SWATCH_BUTTON_CLASS}
						disabled={!editor.can().chain().focus().addColumnAfter().run()}
						onClick={() => editor.chain().focus().addColumnAfter().run()}
					>
						列を右に追加
					</button>
					<button
						type="button"
						className={SWATCH_BUTTON_CLASS}
						disabled={!editor.can().chain().focus().deleteColumn().run()}
						onClick={() => editor.chain().focus().deleteColumn().run()}
					>
						列を削除
					</button>
					<button
						type="button"
						className={SWATCH_BUTTON_CLASS}
						disabled={!editor.can().chain().focus().deleteTable().run()}
						onClick={() => editor.chain().focus().deleteTable().run()}
					>
						表全体を削除
					</button>
				</div>
			)}
			{context.inCallout && (
				<div className="flex flex-wrap gap-1" role="group" aria-label="コールアウトの種別変更">
					{CALLOUT_VARIANTS.map((v) => (
						<button
							key={v.name}
							type="button"
							className={SWATCH_BUTTON_CLASS}
							aria-pressed={context.calloutVariant === v.name}
							onClick={() =>
								editor.chain().focus().updateAttributes('callout', { variant: v.name }).run()
							}
						>
							{v.icon} {v.label}
						</button>
					))}
				</div>
			)}
		</BubbleMenu>
	);
};

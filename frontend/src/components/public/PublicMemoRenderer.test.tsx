import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { JSONContent } from '@tiptap/react';

const mockUseEditor = vi.fn(() => ({ isEditable: false }));
const mockCreateEditorExtensions = vi.fn(() => ['ext']);

vi.mock('@tiptap/react', () => ({
	useEditor: (config: unknown) => mockUseEditor(config),
	EditorContent: ({ editor }: { editor: unknown }) =>
		React.createElement('div', {
			'data-testid': 'editor-content',
			'data-editable': String((editor as { isEditable?: boolean })?.isEditable),
		}),
}));

vi.mock('../editor/createEditorExtensions', () => ({
	createEditorExtensions: (options: unknown) => mockCreateEditorExtensions(options),
}));

import { PublicMemoRenderer } from './PublicMemoRenderer';

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };
const TEXT_DOC: JSONContent = {
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text: 'テスト' }] }],
};

describe('PublicMemoRenderer', () => {
	beforeEach(() => {
		mockUseEditor.mockReturnValue({ isEditable: false });
		mockCreateEditorExtensions.mockClear();
	});

	it('EditorContent を描画する', () => {
		render(React.createElement(PublicMemoRenderer, { content: TEXT_DOC }));
		expect(screen.getByTestId('editor-content')).toBeTruthy();
	});

	it('読み取り専用であること（editable: false）', () => {
		render(React.createElement(PublicMemoRenderer, { content: TEXT_DOC }));

		const lastCall = mockUseEditor.mock.calls[mockUseEditor.mock.calls.length - 1][0] as {
			editable: boolean;
		};
		expect(lastCall.editable).toBe(false);
	});

	it('共有ファクトリ createEditorExtensions({ editable: false }) で拡張を構築する', () => {
		render(React.createElement(PublicMemoRenderer, { content: TEXT_DOC }));

		expect(mockCreateEditorExtensions).toHaveBeenCalledWith({ editable: false });

		const lastCall = mockUseEditor.mock.calls[mockUseEditor.mock.calls.length - 1][0] as {
			extensions: unknown;
		};
		expect(lastCall.extensions).toEqual(['ext']);
	});

	it('pointer-events-none を持たない（トグル開閉・リンク遷移を可能にするため。編集拒否は editable:false に一本化。Req4.4/4.5/6.4）', () => {
		render(React.createElement(PublicMemoRenderer, { content: TEXT_DOC }));

		const lastCall = mockUseEditor.mock.calls[mockUseEditor.mock.calls.length - 1][0] as {
			editorProps: { attributes: { class: string } };
		};
		const className = lastCall.editorProps.attributes.class;
		expect(className).not.toContain('pointer-events-none');
	});

	it('テキスト選択（select-text）は維持する', () => {
		render(React.createElement(PublicMemoRenderer, { content: TEXT_DOC }));

		const lastCall = mockUseEditor.mock.calls[mockUseEditor.mock.calls.length - 1][0] as {
			editorProps: { attributes: { class: string } };
		};
		const className = lastCall.editorProps.attributes.class;
		expect(className).toContain('select-text');
	});

	it('editorProps.attributes.class に prose クラスを保持する（タイポグラフィ回帰ガード）', () => {
		render(React.createElement(PublicMemoRenderer, { content: TEXT_DOC }));

		const lastCall = mockUseEditor.mock.calls[mockUseEditor.mock.calls.length - 1][0] as {
			editorProps: { attributes: { class: string } };
		};
		const className = lastCall.editorProps.attributes.class;
		expect(className).toContain('prose');
		expect(className).toContain('prose-sm');
	});

	it('toolbar が存在しないこと', () => {
		render(React.createElement(PublicMemoRenderer, { content: TEXT_DOC }));
		expect(screen.queryByRole('toolbar')).toBeNull();
		expect(screen.queryByText('太字')).toBeNull();
		expect(screen.queryByText('斜体')).toBeNull();
	});

	it('editor が null の場合は何も描画しないこと', () => {
		mockUseEditor.mockReturnValue(null);

		const { container } = render(React.createElement(PublicMemoRenderer, { content: EMPTY_DOC }));
		expect(container.firstChild).toBeNull();
	});

	it('JSONContent が useEditor の content として渡される', () => {
		render(React.createElement(PublicMemoRenderer, { content: TEXT_DOC }));

		const lastCall = mockUseEditor.mock.calls[mockUseEditor.mock.calls.length - 1][0] as {
			content: JSONContent;
		};
		expect(lastCall.content).toEqual(TEXT_DOC);
	});
});

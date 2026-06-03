import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

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

describe('PublicMemoRenderer', () => {
	beforeEach(() => {
		mockUseEditor.mockReturnValue({ isEditable: false });
		mockCreateEditorExtensions.mockClear();
	});

	it('EditorContent を描画する', () => {
		render(React.createElement(PublicMemoRenderer, { content: '<p>テスト</p>' }));
		expect(screen.getByTestId('editor-content')).toBeTruthy();
	});

	it('読み取り専用であること（editable: false）', () => {
		render(React.createElement(PublicMemoRenderer, { content: '<p>テスト</p>' }));

		const lastCall = mockUseEditor.mock.calls[mockUseEditor.mock.calls.length - 1][0] as {
			editable: boolean;
		};
		expect(lastCall.editable).toBe(false);
	});

	it('共有ファクトリ createEditorExtensions({ editable: false }) で拡張を構築する', () => {
		render(React.createElement(PublicMemoRenderer, { content: '<p>テスト</p>' }));

		expect(mockCreateEditorExtensions).toHaveBeenCalledWith({ editable: false });

		const lastCall = mockUseEditor.mock.calls[mockUseEditor.mock.calls.length - 1][0] as {
			extensions: unknown;
		};
		expect(lastCall.extensions).toEqual(['ext']);
	});

	it('既存の表示属性（pointer-events-none select-text）を維持する', () => {
		render(React.createElement(PublicMemoRenderer, { content: '<p>テスト</p>' }));

		const lastCall = mockUseEditor.mock.calls[mockUseEditor.mock.calls.length - 1][0] as {
			editorProps: { attributes: { class: string } };
		};
		const className = lastCall.editorProps.attributes.class;
		expect(className).toContain('pointer-events-none');
		expect(className).toContain('select-text');
	});

	it('toolbar が存在しないこと', () => {
		render(React.createElement(PublicMemoRenderer, { content: '<p>テスト</p>' }));
		expect(screen.queryByRole('toolbar')).toBeNull();
		expect(screen.queryByText('太字')).toBeNull();
		expect(screen.queryByText('斜体')).toBeNull();
	});

	it('editor が null の場合は何も描画しないこと', () => {
		mockUseEditor.mockReturnValue(null);

		const { container } = render(React.createElement(PublicMemoRenderer, { content: '' }));
		expect(container.firstChild).toBeNull();
	});
});

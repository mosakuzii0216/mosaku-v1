import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const mockUseEditor = vi.fn(() => ({ isEditable: false }));

vi.mock('@tiptap/react', () => ({
	useEditor: (config: unknown) => mockUseEditor(config),
	EditorContent: ({ editor }: { editor: unknown }) =>
		React.createElement('div', {
			'data-testid': 'editor-content',
			'data-editable': String((editor as { isEditable?: boolean })?.isEditable),
		}),
}));

vi.mock('@tiptap/starter-kit', () => ({ default: {} }));

import { PublicMemoRenderer } from './PublicMemoRenderer';

describe('PublicMemoRenderer', () => {
	beforeEach(() => {
		mockUseEditor.mockReturnValue({ isEditable: false });
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

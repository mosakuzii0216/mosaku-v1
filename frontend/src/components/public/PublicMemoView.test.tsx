import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import React from 'react';

vi.mock('./PublicMemoRenderer', () => ({
	PublicMemoRenderer: ({ content }: { content: string }) =>
		React.createElement('div', { 'data-testid': 'public-memo-renderer' }, content),
}));

import { PublicMemoView } from './PublicMemoView';
import type { PublicMemoResponseDto } from '../../types/memo';

const mockMemo: PublicMemoResponseDto = {
	title: 'テストメモタイトル',
	content: '<p>テスト本文</p>',
	updatedAt: '2026-05-30T10:00:00Z',
};

function renderView(memo: PublicMemoResponseDto) {
	return render(
		React.createElement(MemoryRouter, null, React.createElement(PublicMemoView, { memo })),
	);
}

describe('PublicMemoView', () => {
	it('メモのタイトルを表示する', () => {
		renderView(mockMemo);
		expect(screen.getByText('テストメモタイトル')).toBeTruthy();
	});

	it('PublicMemoRenderer を描画する', () => {
		renderView(mockMemo);
		expect(screen.getByTestId('public-memo-renderer')).toBeTruthy();
	});

	it('最終更新日時を表示する', () => {
		renderView(mockMemo);
		expect(screen.getByText(/更新/)).toBeTruthy();
	});

	it('閲覧専用の注記が表示される', () => {
		renderView(mockMemo);
		expect(screen.getByText(/閲覧専用/)).toBeTruthy();
	});

	it('Mosaku への導線 CTA が表示される', () => {
		renderView(mockMemo);
		expect(screen.getByText('Mosaku に参加する')).toBeTruthy();
	});

	it('編集 UI が存在しないこと', () => {
		renderView(mockMemo);
		expect(screen.queryByText('編集')).toBeNull();
		expect(screen.queryByText('保存')).toBeNull();
		expect(screen.queryByText('複製')).toBeNull();
	});

	it('コメント入力欄が存在しないこと', () => {
		renderView(mockMemo);
		expect(screen.queryByRole('textbox')).toBeNull();
	});
});

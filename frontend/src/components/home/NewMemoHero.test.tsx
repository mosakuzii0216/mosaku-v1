import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

const mockGoToMemoCreate = vi.fn();

vi.mock('../../hooks/useNavigation', () => ({
	useNavigation: vi.fn(() => ({
		goToMemoCreate: mockGoToMemoCreate,
	})),
}));

import { NewMemoHero } from './NewMemoHero';

describe('NewMemoHero', () => {
	it('「新しいメモを書く」ボタンを表示する', () => {
		const { getByRole } = render(<NewMemoHero />);
		expect(getByRole('button', { name: /新しいメモを書く/ })).toBeTruthy();
	});

	it('ボタンクリックで goToMemoCreate を呼び出す', () => {
		const { getByRole } = render(<NewMemoHero />);
		fireEvent.click(getByRole('button', { name: /新しいメモを書く/ }));
		expect(mockGoToMemoCreate).toHaveBeenCalledTimes(1);
	});
});

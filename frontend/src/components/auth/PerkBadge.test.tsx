import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PerkBadge } from './PerkBadge';

describe('PerkBadge', () => {
	it('comp のとき AI 無料枠つきバッジを描画する', () => {
		render(<PerkBadge perk={{ type: 'comp', months: 3 }} />);
		expect(screen.getByText(/AI 無料枠つき/)).toBeTruthy();
	});

	it('comp のとき月数を表示する', () => {
		render(<PerkBadge perk={{ type: 'comp', months: 2 }} />);
		expect(screen.getByText(/2 ヶ月/)).toBeTruthy();
	});

	it('none のとき何も描画しない', () => {
		const { container } = render(<PerkBadge perk={{ type: 'none' }} />);
		expect(container.firstChild).toBeNull();
	});
});

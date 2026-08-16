import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InvitationErrorBanner } from './InvitationErrorBanner';

describe('InvitationErrorBanner', () => {
	it('指定されたメッセージを表示する', () => {
		render(<InvitationErrorBanner message="招待コードが無効です" onContinue={vi.fn()} />);
		expect(screen.getByText('招待コードが無効です')).toBeTruthy();
	});

	it('「招待コードなしのトップへ戻る」ボタンを表示する', () => {
		render(<InvitationErrorBanner message="dummy" onContinue={vi.fn()} />);
		expect(screen.getByRole('button', { name: /トップへ戻る/ })).toBeTruthy();
	});

	it('ボタン押下で onContinue が呼ばれる', () => {
		const onContinue = vi.fn();
		render(<InvitationErrorBanner message="dummy" onContinue={onContinue} />);
		fireEvent.click(screen.getByRole('button', { name: /トップへ戻る/ }));
		expect(onContinue).toHaveBeenCalledTimes(1);
	});

	it('role="alert" を持つ', () => {
		const { container } = render(<InvitationErrorBanner message="dummy" onContinue={vi.fn()} />);
		expect(container.querySelector('[role="alert"]')).toBeTruthy();
	});
});

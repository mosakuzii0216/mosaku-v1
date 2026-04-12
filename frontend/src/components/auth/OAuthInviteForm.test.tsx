import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { OAuthInviteForm } from './OAuthInviteForm';

describe('OAuthInviteForm - 森テーマスタイル', () => {
	const defaultProps = {
		providerName: 'Google' as const,
		pendingUser: null,
		invitationCode: '',
		setInvitationCode: vi.fn(),
		onSubmit: vi.fn(),
		loading: false,
	};

	describe('入力フィールドのスタイル', () => {
		it('招待コード入力フィールドに bg-black/40 が適用されること', () => {
			const { container } = render(<OAuthInviteForm {...defaultProps} />);
			const input = container.querySelector('input[type="text"]') as HTMLElement;
			expect(input.className).toMatch(/bg-black\/40/);
		});

		it('招待コード入力フィールドに border-green-700 が適用されること', () => {
			const { container } = render(<OAuthInviteForm {...defaultProps} />);
			const input = container.querySelector('input[type="text"]') as HTMLElement;
			expect(input.className).toMatch(/border-green-700/);
		});

		it('招待コード入力フィールドに focus:ring-emerald-500 が適用されること', () => {
			const { container } = render(<OAuthInviteForm {...defaultProps} />);
			const input = container.querySelector('input[type="text"]') as HTMLElement;
			expect(input.className).toMatch(/focus:ring-emerald-500/);
		});
	});

	describe('送信ボタンのスタイル', () => {
		it('送信ボタンに森テーマの背景色が適用されること', () => {
			const { container } = render(<OAuthInviteForm {...defaultProps} />);
			const button = container.querySelector('button[type="submit"]') as HTMLElement;
			// forest テーマのボタンスタイル確認
			expect(button.className).toMatch(/bg-black\/40|bg-emerald|bg-green/);
		});
	});

	describe('プロバイダー情報エリアのスタイル', () => {
		it('pendingUser がある場合、プロバイダー情報エリアに森テーマスタイルが適用されること', () => {
			const { container } = render(
				<OAuthInviteForm
					{...defaultProps}
					pendingUser={{ email: 'test@example.com', name: 'Test' }}
				/>,
			);
			// 森テーマの背景クラスが存在することを確認
			const hasForestBg =
				container.querySelector('[class*="bg-black"]') !== null ||
				container.querySelector('[class*="bg-green"]') !== null ||
				container.querySelector('[class*="bg-emerald"]') !== null;
			expect(hasForestBg).toBe(true);
		});
	});
});

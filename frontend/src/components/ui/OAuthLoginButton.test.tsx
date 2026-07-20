import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OAuthLoginButton } from './OAuthLoginButton';

vi.mock('../../contexts/AuthContext', () => ({
	useAuth: () => ({
		googleLogin: vi.fn(),
		appleLogin: vi.fn(),
		xLogin: vi.fn(),
	}),
}));

describe('OAuthLoginButton', () => {
	describe('variant="forest"', () => {
		it('forest variant のボタンに bg-black/40 クラスが適用されること', () => {
			const { container } = render(<OAuthLoginButton provider="google" variant="forest" />);
			const button = container.querySelector('button') as HTMLElement;
			expect(button.className).toMatch(/bg-black\/40/);
		});

		it('forest variant のボタンに border-green-700 クラスが適用されること', () => {
			const { container } = render(<OAuthLoginButton provider="google" variant="forest" />);
			const button = container.querySelector('button') as HTMLElement;
			expect(button.className).toMatch(/border-green-700/);
		});

		it('forest variant のボタンに text-green-100 クラスが適用されること', () => {
			const { container } = render(<OAuthLoginButton provider="google" variant="forest" />);
			const button = container.querySelector('button') as HTMLElement;
			expect(button.className).toMatch(/text-green-100/);
		});

		it('forest variant のボタンに hover:bg-black/60 クラスが適用されること', () => {
			const { container } = render(<OAuthLoginButton provider="google" variant="forest" />);
			const button = container.querySelector('button') as HTMLElement;
			expect(button.className).toMatch(/hover:bg-black\/60/);
		});

		it('全プロバイダーで forest variant が適用されること', () => {
			const providers = ['google', 'apple', 'x'] as const;
			providers.forEach((provider) => {
				const { container } = render(<OAuthLoginButton provider={provider} variant="forest" />);
				const button = container.querySelector('button') as HTMLElement;
				expect(button.className).toMatch(/bg-black\/40/);
			});
		});
	});

	describe('variant="default" または省略時の後方互換性', () => {
		it('variant 省略時は bg-black/40 が適用されないこと', () => {
			const { container } = render(<OAuthLoginButton provider="google" />);
			const button = container.querySelector('button') as HTMLElement;
			expect(button.className).not.toMatch(/bg-black\/40/);
		});

		it('variant="default" 時は bg-black/40 が適用されないこと', () => {
			const { container } = render(<OAuthLoginButton provider="google" variant="default" />);
			const button = container.querySelector('button') as HTMLElement;
			expect(button.className).not.toMatch(/bg-black\/40/);
		});

		it('forest variant でもプロバイダーアイコンが維持されること', () => {
			render(<OAuthLoginButton provider="google" variant="forest" />);
			// Google アイコンは SVG 要素として存在する
			const button = screen.getByRole('button');
			const svg = button.querySelector('svg');
			expect(svg).toBeTruthy();
		});
	});
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { FeedbackModal } from './FeedbackModal';
import { ApiError } from '../../utils/apiError';

const submitFeedbackMock = vi.fn();
let mockIsSubmitting = false;

vi.mock('../../hooks/useFeedbackQueries', () => ({
	useFeedbackQueries: () => ({
		submitFeedback: submitFeedbackMock,
		isSubmitting: mockIsSubmitting,
	}),
}));

describe('FeedbackModal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsSubmitting = false;
		cleanup();
	});

	it('isOpen が false のとき null を返す', () => {
		const { container } = render(<FeedbackModal isOpen={false} onClose={vi.fn()} />);
		expect(container.firstChild).toBeNull();
	});

	it('isOpen が true のときモーダルが表示される', () => {
		render(<FeedbackModal isOpen={true} onClose={vi.fn()} />);
		expect(screen.getByRole('dialog')).toBeTruthy();
	});

	it('デフォルトはカテゴリ未選択状態', () => {
		render(<FeedbackModal isOpen={true} onClose={vi.fn()} />);
		const buttons = screen
			.getAllByRole('button')
			.filter((b) => b.getAttribute('aria-pressed') !== null);
		buttons.forEach((b) => {
			expect(b.getAttribute('aria-pressed')).toBe('false');
		});
	});

	it('カテゴリ未選択で送信するとエラーが表示され mutation が呼ばれない', () => {
		render(<FeedbackModal isOpen={true} onClose={vi.fn()} />);

		const textarea = screen.getByRole('textbox');
		fireEvent.change(textarea, { target: { value: 'テストメッセージ' } });

		const submitButton = screen.getByRole('button', { name: /送信/ });
		fireEvent.click(submitButton);

		expect(screen.getByText(/カテゴリを選択してください/)).toBeTruthy();
		expect(submitFeedbackMock).not.toHaveBeenCalled();
	});

	it('メッセージ空で送信するとエラーが表示され mutation が呼ばれない', () => {
		render(<FeedbackModal isOpen={true} onClose={vi.fn()} />);

		const bugButton = screen.getByRole('button', { name: /不具合/ });
		fireEvent.click(bugButton);

		const submitButton = screen.getByRole('button', { name: /送信/ });
		fireEvent.click(submitButton);

		expect(screen.getByText(/メッセージを入力してください/)).toBeTruthy();
		expect(submitFeedbackMock).not.toHaveBeenCalled();
	});

	it('1001文字メッセージで送信するとエラーが表示される', () => {
		render(<FeedbackModal isOpen={true} onClose={vi.fn()} />);

		const bugButton = screen.getByRole('button', { name: /不具合/ });
		fireEvent.click(bugButton);

		const textarea = screen.getByRole('textbox');
		fireEvent.change(textarea, { target: { value: 'a'.repeat(1001) } });

		const submitButton = screen.getByRole('button', { name: /送信/ });
		fireEvent.click(submitButton);

		expect(screen.getByText(/1000文字以内/)).toBeTruthy();
		expect(submitFeedbackMock).not.toHaveBeenCalled();
	});

	it('文字数カウンターがリアルタイムで更新される', () => {
		render(<FeedbackModal isOpen={true} onClose={vi.fn()} />);

		expect(screen.getByText('0 / 1000')).toBeTruthy();

		const textarea = screen.getByRole('textbox');
		fireEvent.change(textarea, { target: { value: 'abc' } });

		expect(screen.getByText('3 / 1000')).toBeTruthy();
	});

	it('送信成功後に onClose が呼ばれる', async () => {
		submitFeedbackMock.mockResolvedValue(undefined);
		const onClose = vi.fn();
		render(<FeedbackModal isOpen={true} onClose={onClose} />);

		const bugButton = screen.getByRole('button', { name: /不具合/ });
		fireEvent.click(bugButton);

		const textarea = screen.getByRole('textbox');
		fireEvent.change(textarea, { target: { value: 'バグを発見しました' } });

		const submitButton = screen.getByRole('button', { name: /送信/ });
		await act(async () => {
			fireEvent.click(submitButton);
		});

		await waitFor(
			() => {
				expect(onClose).toHaveBeenCalled();
			},
			{ timeout: 3000 },
		);
	});

	it('429 エラー時にレート制限メッセージが表示される', async () => {
		submitFeedbackMock.mockRejectedValue(
			new ApiError({ code: null, message: 'Too Many Requests', statusCode: 429 }),
		);
		render(<FeedbackModal isOpen={true} onClose={vi.fn()} />);

		const bugButton = screen.getByRole('button', { name: /不具合/ });
		fireEvent.click(bugButton);

		const textarea = screen.getByRole('textbox');
		fireEvent.change(textarea, { target: { value: 'テスト' } });

		const submitButton = screen.getByRole('button', { name: /送信/ });
		await act(async () => {
			fireEvent.click(submitButton);
		});

		await waitFor(() => {
			expect(screen.getByText(/送信が多すぎます/)).toBeTruthy();
		});
	});

	it('backdrop クリックで onClose が呼ばれる', () => {
		const onClose = vi.fn();
		render(<FeedbackModal isOpen={true} onClose={onClose} />);

		const backdrop = screen.getByTestId('feedback-backdrop');
		fireEvent.click(backdrop);

		expect(onClose).toHaveBeenCalled();
	});

	it('ESC キーで onClose が呼ばれる', () => {
		const onClose = vi.fn();
		render(<FeedbackModal isOpen={true} onClose={onClose} />);

		fireEvent.keyDown(document, { key: 'Escape' });

		expect(onClose).toHaveBeenCalled();
	});
});

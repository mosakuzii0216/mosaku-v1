import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { InvitationCode } from '../../types/invitation';

const getInvitations = vi.fn();
const createInvitation = vi.fn();
const deleteInvitation = vi.fn();

vi.mock('../../utils/api', () => ({
	apiClient: {
		getInvitations: (...args: unknown[]) => getInvitations(...args),
		createInvitation: (...args: unknown[]) => createInvitation(...args),
		deleteInvitation: (...args: unknown[]) => deleteInvitation(...args),
	},
}));

vi.mock('../../utils/logger', () => ({
	logger: { error: vi.fn() },
}));

import InvitationManager from './InvitationManager';

function renderManager() {
	return render(
		<MemoryRouter>
			<InvitationManager />
		</MemoryRouter>,
	);
}

const baseInvitation: InvitationCode = {
	id: 'inv-1',
	code: 'abc123xyz9',
	maxUses: 3,
	usedCount: 1,
	expiresAt: null,
	createdAt: '2026-05-24T00:00:00Z',
	updatedAt: '2026-05-24T00:00:00Z',
};

describe('InvitationManager', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('読み込み中は「読み込み中...」を表示する', async () => {
		let resolveLoad: (value: InvitationCode[]) => void = () => {};
		getInvitations.mockReturnValue(
			new Promise<InvitationCode[]>((resolve) => {
				resolveLoad = resolve;
			}),
		);

		renderManager();

		expect(screen.getByText('読み込み中...')).toBeTruthy();

		await act(async () => {
			resolveLoad([]);
		});
	});

	it('招待コードが 0 件のときは「招待コードがありません」を表示する', async () => {
		getInvitations.mockResolvedValue([]);

		renderManager();

		await waitFor(() => expect(screen.getByText('招待コードがありません')).toBeTruthy());
	});

	it('読み込み成功時は一覧に code / 使用状況 / 作成日を表示する', async () => {
		getInvitations.mockResolvedValue([baseInvitation]);

		renderManager();

		await waitFor(() => expect(screen.getByText('abc123xyz9')).toBeTruthy());
		expect(screen.getByText('1/3')).toBeTruthy();
	});

	it('読み込み失敗時はエラーメッセージを表示しローディングを終える', async () => {
		getInvitations.mockRejectedValue(new Error('ネットワークエラー'));

		renderManager();

		await waitFor(() => expect(screen.getByText('ネットワークエラー')).toBeTruthy());
		expect(screen.queryByText('読み込み中...')).toBeNull();
	});

	it('作成成功時は一覧の先頭に追加され、フォームがリセットされ、成功メッセージを表示する', async () => {
		getInvitations.mockResolvedValue([]);
		const created: InvitationCode = {
			id: 'inv-2',
			code: 'newcode001',
			maxUses: 5,
			usedCount: 0,
			expiresAt: null,
			createdAt: '2026-08-20T00:00:00Z',
			updatedAt: '2026-08-20T00:00:00Z',
		};
		createInvitation.mockResolvedValue(created);

		renderManager();
		await waitFor(() => expect(screen.getByText('招待コードがありません')).toBeTruthy());

		const maxUsesInput = screen.getByLabelText('最大使用回数') as HTMLInputElement;
		fireEvent.change(maxUsesInput, { target: { value: '5' } });

		const submitButton = screen.getByRole('button', { name: '招待コードを作成' });
		await act(async () => {
			fireEvent.click(submitButton);
		});

		await waitFor(() =>
			expect(createInvitation).toHaveBeenCalledWith({ maxUses: 5, expiresAt: null }),
		);
		await waitFor(() => expect(screen.getByText('newcode001')).toBeTruthy());
		expect(screen.getByText('招待コードが作成されました')).toBeTruthy();
		expect(maxUsesInput.value).toBe('1');
	});

	it('作成失敗時はエラーメッセージを表示し、作成中フラグを解除する', async () => {
		getInvitations.mockResolvedValue([]);
		createInvitation.mockRejectedValue(new Error('作成に失敗しました'));

		renderManager();
		await waitFor(() => expect(screen.getByText('招待コードがありません')).toBeTruthy());

		const submitButton = screen.getByRole('button', {
			name: '招待コードを作成',
		}) as HTMLButtonElement;
		await act(async () => {
			fireEvent.click(submitButton);
		});

		await waitFor(() => expect(screen.getByText('作成に失敗しました')).toBeTruthy());
		expect(submitButton.disabled).toBe(false);
	});

	it('削除確認をキャンセルすると deleteInvitation は呼ばれない', async () => {
		getInvitations.mockResolvedValue([baseInvitation]);
		vi.spyOn(window, 'confirm').mockReturnValue(false);

		renderManager();
		const deleteButton = await screen.findByRole('button', { name: '削除' });

		await act(async () => {
			fireEvent.click(deleteButton);
		});

		expect(deleteInvitation).not.toHaveBeenCalled();
		expect(screen.getByText('abc123xyz9')).toBeTruthy();
	});

	it('削除確認後は deleteInvitation を呼び、一覧から取り除いて成功メッセージを表示する', async () => {
		getInvitations.mockResolvedValue([baseInvitation]);
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		deleteInvitation.mockResolvedValue(undefined);

		renderManager();
		const deleteButton = await screen.findByRole('button', { name: '削除' });

		await act(async () => {
			fireEvent.click(deleteButton);
		});

		await waitFor(() => expect(deleteInvitation).toHaveBeenCalledWith('inv-1'));
		await waitFor(() => expect(screen.queryByText('abc123xyz9')).toBeNull());
		expect(screen.getByText('招待コードが削除されました')).toBeTruthy();
	});

	it('削除失敗時はエラーメッセージを表示し、一覧から取り除かない', async () => {
		getInvitations.mockResolvedValue([baseInvitation]);
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		deleteInvitation.mockRejectedValue(new Error('削除に失敗しました'));

		renderManager();
		const deleteButton = await screen.findByRole('button', { name: '削除' });

		await act(async () => {
			fireEvent.click(deleteButton);
		});

		await waitFor(() => expect(screen.getByText('削除に失敗しました')).toBeTruthy());
		expect(screen.getByText('abc123xyz9')).toBeTruthy();
	});

	it('コピー ボタン押下でクリップボードへコード文字列を書き込み、完了メッセージを表示する', async () => {
		getInvitations.mockResolvedValue([baseInvitation]);
		const writeTextMock = vi.fn();
		vi.stubGlobal('navigator', {
			...navigator,
			clipboard: { writeText: writeTextMock },
		});

		renderManager();
		const copyButton = await screen.findByRole('button', { name: 'コピー' });

		fireEvent.click(copyButton);

		expect(writeTextMock).toHaveBeenCalledWith('abc123xyz9');
		expect(screen.getByText('招待コードをクリップボードにコピーしました')).toBeTruthy();

		vi.unstubAllGlobals();
	});
});

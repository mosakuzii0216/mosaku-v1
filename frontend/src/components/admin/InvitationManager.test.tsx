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
	logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
	code: 'abc123xyz0',
	maxUses: 3,
	usedCount: 1,
	expiresAt: null,
	createdAt: '2026-01-01T00:00:00Z',
	updatedAt: '2026-01-01T00:00:00Z',
};

describe('InvitationManager', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	describe('初回読み込み', () => {
		it('読み込み中はローディング表示になる', () => {
			getInvitations.mockReturnValue(new Promise(() => {}));
			renderManager();
			expect(screen.getByText('読み込み中...')).toBeTruthy();
		});

		it('取得できた招待コード一覧を表示する', async () => {
			getInvitations.mockResolvedValue([baseInvitation]);
			renderManager();

			await waitFor(() => expect(screen.getByText('abc123xyz0')).toBeTruthy());
			expect(screen.getByText('1/3')).toBeTruthy();
		});

		it('一覧が空のときは空状態メッセージを表示する', async () => {
			getInvitations.mockResolvedValue([]);
			renderManager();

			await waitFor(() => expect(screen.getByText('招待コードがありません')).toBeTruthy());
		});

		it('取得に失敗したらエラーメッセージを表示する', async () => {
			getInvitations.mockRejectedValue(new Error('network down'));
			renderManager();

			await waitFor(() => expect(screen.getByText('network down')).toBeTruthy());
		});

		it('Error インスタンスでない失敗は既定メッセージを表示する', async () => {
			getInvitations.mockRejectedValue('boom');
			renderManager();

			await waitFor(() => expect(screen.getByText('Failed to load invitations')).toBeTruthy());
		});
	});

	describe('招待コードの作成', () => {
		it('作成に成功したら一覧の先頭に追加し、フォームと成功メッセージをリセットする', async () => {
			getInvitations.mockResolvedValue([]);
			const created: InvitationCode = { ...baseInvitation, id: 'inv-new', code: 'newcode001' };
			createInvitation.mockResolvedValue(created);
			renderManager();

			await waitFor(() => expect(screen.getByText('招待コードがありません')).toBeTruthy());

			const maxUsesInput = screen.getByLabelText('最大使用回数') as HTMLInputElement;
			fireEvent.change(maxUsesInput, { target: { value: '5' } });

			await act(async () => {
				fireEvent.click(screen.getByRole('button', { name: '招待コードを作成' }));
			});

			expect(createInvitation).toHaveBeenCalledWith({ maxUses: 5, expiresAt: null });
			await waitFor(() => expect(screen.getByText('newcode001')).toBeTruthy());
			expect(screen.getByText('招待コードが作成されました')).toBeTruthy();
			expect(maxUsesInput.value).toBe('1');
		});

		it('作成に失敗したらエラーメッセージを表示する', async () => {
			getInvitations.mockResolvedValue([]);
			createInvitation.mockRejectedValue(new Error('create failed'));
			renderManager();

			await waitFor(() => expect(screen.getByText('招待コードがありません')).toBeTruthy());

			await act(async () => {
				fireEvent.click(screen.getByRole('button', { name: '招待コードを作成' }));
			});

			await waitFor(() => expect(screen.getByText('create failed')).toBeTruthy());
		});

		it('Error インスタンスでない失敗は既定メッセージを表示する', async () => {
			getInvitations.mockResolvedValue([]);
			createInvitation.mockRejectedValue('boom');
			renderManager();

			await waitFor(() => expect(screen.getByText('招待コードがありません')).toBeTruthy());

			await act(async () => {
				fireEvent.click(screen.getByRole('button', { name: '招待コードを作成' }));
			});

			await waitFor(() => expect(screen.getByText('Failed to create invitation')).toBeTruthy());
		});
	});

	describe('招待コードの削除', () => {
		it('確認ダイアログでキャンセルすると削除されない', async () => {
			vi.spyOn(window, 'confirm').mockReturnValue(false);
			getInvitations.mockResolvedValue([baseInvitation]);
			renderManager();

			await waitFor(() => expect(screen.getByText('abc123xyz0')).toBeTruthy());
			fireEvent.click(screen.getByRole('button', { name: '削除' }));

			expect(deleteInvitation).not.toHaveBeenCalled();
			expect(screen.getByText('abc123xyz0')).toBeTruthy();
		});

		it('確認して成功したら一覧から取り除き成功メッセージを表示する', async () => {
			vi.spyOn(window, 'confirm').mockReturnValue(true);
			getInvitations.mockResolvedValue([baseInvitation]);
			deleteInvitation.mockResolvedValue(undefined);
			renderManager();

			await waitFor(() => expect(screen.getByText('abc123xyz0')).toBeTruthy());

			await act(async () => {
				fireEvent.click(screen.getByRole('button', { name: '削除' }));
			});

			expect(deleteInvitation).toHaveBeenCalledWith('inv-1');
			await waitFor(() => expect(screen.getByText('招待コードが削除されました')).toBeTruthy());
			expect(screen.queryByText('abc123xyz0')).toBeNull();
		});

		it('削除に失敗したらエラーメッセージを表示し、一覧は変わらない', async () => {
			vi.spyOn(window, 'confirm').mockReturnValue(true);
			getInvitations.mockResolvedValue([baseInvitation]);
			deleteInvitation.mockRejectedValue(new Error('delete failed'));
			renderManager();

			await waitFor(() => expect(screen.getByText('abc123xyz0')).toBeTruthy());

			await act(async () => {
				fireEvent.click(screen.getByRole('button', { name: '削除' }));
			});

			await waitFor(() => expect(screen.getByText('delete failed')).toBeTruthy());
			expect(screen.getByText('abc123xyz0')).toBeTruthy();
		});

		it('Error インスタンスでない失敗は既定メッセージを表示する', async () => {
			vi.spyOn(window, 'confirm').mockReturnValue(true);
			getInvitations.mockResolvedValue([baseInvitation]);
			deleteInvitation.mockRejectedValue('boom');
			renderManager();

			await waitFor(() => expect(screen.getByText('abc123xyz0')).toBeTruthy());

			await act(async () => {
				fireEvent.click(screen.getByRole('button', { name: '削除' }));
			});

			await waitFor(() => expect(screen.getByText('Failed to delete invitation')).toBeTruthy());
		});
	});

	describe('クリップボードへのコピー', () => {
		it('コピー操作で招待コードをクリップボードへ書き込みメッセージを表示する', async () => {
			const writeTextMock = vi.fn();
			vi.stubGlobal('navigator', {
				...navigator,
				clipboard: { writeText: writeTextMock },
			});
			getInvitations.mockResolvedValue([baseInvitation]);
			renderManager();

			await waitFor(() => expect(screen.getByText('abc123xyz0')).toBeTruthy());
			fireEvent.click(screen.getByRole('button', { name: 'コピー' }));

			expect(writeTextMock).toHaveBeenCalledWith('abc123xyz0');
			expect(screen.getByText('招待コードをクリップボードにコピーしました')).toBeTruthy();
		});
	});

	describe('使用状況・有効期限のバッジ表示', () => {
		it('使用回数が上限に達しているとき赤系のバッジになる', async () => {
			getInvitations.mockResolvedValue([{ ...baseInvitation, usedCount: 3, maxUses: 3 }]);
			renderManager();

			const badge = await screen.findByText('3/3');
			expect(badge.className).toContain('bg-red-100');
		});

		it('使用回数が上限未満のとき緑系のバッジになる', async () => {
			getInvitations.mockResolvedValue([baseInvitation]);
			renderManager();

			const badge = await screen.findByText('1/3');
			expect(badge.className).toContain('bg-green-100');
		});

		it('有効期限が未設定のときは「なし」と表示する', async () => {
			getInvitations.mockResolvedValue([baseInvitation]);
			renderManager();

			await waitFor(() => expect(screen.getByText('なし')).toBeTruthy());
		});

		it('有効期限が過去のときは期限表示が赤字になる', async () => {
			getInvitations.mockResolvedValue([{ ...baseInvitation, expiresAt: '2020-01-01T00:00:00Z' }]);
			renderManager();

			await waitFor(() => expect(screen.getByText('abc123xyz0')).toBeTruthy());
			const expiryCell = screen.getByText(new Date('2020-01-01T00:00:00Z').toLocaleString('ja-JP'));
			expect(expiryCell.className).toContain('text-red-500');
		});

		it('有効期限が未来のときは期限表示が通常色になる', async () => {
			const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
			getInvitations.mockResolvedValue([{ ...baseInvitation, expiresAt: future }]);
			renderManager();

			await waitFor(() => expect(screen.getByText('abc123xyz0')).toBeTruthy());
			const expiryCell = screen.getByText(new Date(future).toLocaleString('ja-JP'));
			expect(expiryCell.className).toContain('text-gray-700');
		});
	});
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/*
 * TrashView.test.tsx — ゴミ箱ビューのトークン駆動化（editor-surface-tokenization / Task 6.3）
 * ============================================================================================
 * 何を守るテストか:
 *   TrashView は既存ユニットテストが存在しないままトークン化される二次対象のため、
 *   本タスク内で回帰ガードを新規作成する（Risks #1）。
 *   (a) ルート面が .shell-surface でトークン化される（--danger をテキスト色として使う
 *       前提条件・Risks #3）、(b) 破壊操作（全て削除・削除アイコン・期限警告）が --danger 系を
 *       参照する、(c) 復元アイコンが --accent を参照する、(d) 生 Tailwind 配色を持たない、
 *       を機械検証する。
 */

const emptyTrashMutate = vi.fn();
const restoreMutate = vi.fn();
const permanentDeleteMutate = vi.fn();

vi.mock('../../hooks/useMemoQueries', () => ({
	useTrashMemos: vi.fn(() => ({
		data: [
			{
				id: 'memo-1',
				title: '削除済みメモ',
				trashedAt: new Date().toISOString(),
			},
		],
		isLoading: false,
	})),
	useRestoreMemo: vi.fn(() => ({ mutate: restoreMutate, isPending: false })),
	usePermanentDeleteMemo: vi.fn(() => ({ mutate: permanentDeleteMutate, isPending: false })),
	useEmptyTrash: vi.fn(() => ({ mutate: emptyTrashMutate, isPending: false })),
}));

import { useTrashMemos } from '../../hooks/useMemoQueries';
import { TRASH_RETENTION_DAYS } from '../../constants/trash';
import { TrashView } from './TrashView';

describe('TrashView — トークン駆動化（6.3）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ルート面は .shell-surface でトークン化される（--danger 使用の前提条件・Risks #3）', () => {
		const { container } = render(<TrashView />);
		const root = container.firstChild as HTMLElement;
		expect(root.classList.contains('shell-surface')).toBe(true);
	});

	it('「全て削除」ボタンは破壊の中核色トークンを参照し、生 text-red-600 を持たない', () => {
		render(<TrashView />);
		const button = screen.getByRole('button', { name: 'ゴミ箱を空にする' });
		expect(button.className).toMatch(/var\(--danger\)/);
		expect(button.className).not.toMatch(/text-red-600|border-red-300|hover:bg-red-50/);
	});

	it('復元アイコンボタンは --accent を参照し、生 text-blue-600 を持たない', () => {
		render(<TrashView />);
		const button = screen.getByTitle('復元');
		expect(button.className).toMatch(/var\(--accent\)/);
		expect(button.className).not.toMatch(/text-blue-600|hover:bg-blue-50/);
	});

	it('削除アイコンボタンは --danger を参照し、生 text-red-500 を持たない', () => {
		render(<TrashView />);
		const button = screen.getByTitle('完全削除');
		expect(button.className).toMatch(/var\(--danger\)/);
		expect(button.className).not.toMatch(/text-red-500|hover:bg-red-50/);
	});

	it('ヘッダー境界はトークン境界（var(--outline)）を参照する', () => {
		const { container } = render(<TrashView />);
		const header = container.querySelector('div.flex.items-center.justify-between') as HTMLElement;
		expect(header.className).toMatch(/var\(--outline\)/);
		expect(header.className).not.toMatch(/border-gray-200/);
	});

	it('ルート配下に生 Tailwind 配色（text-gray-*/bg-gray-*/divide-gray-*）が残存しない', () => {
		const { container } = render(<TrashView />);
		expect(container.innerHTML).not.toMatch(
			/text-gray-500|text-gray-800|text-gray-400|divide-gray-100|hover:bg-gray-50/,
		);
	});
});

describe('TrashView — 自動削除までの残り日数', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('残り日数は保持期間の定数から算出する（backend の削除タイミングと同じ値）', () => {
		const daysElapsed = 10;
		const trashedAt = new Date(Date.now() - daysElapsed * 24 * 60 * 60 * 1000 - 1000).toISOString();
		vi.mocked(useTrashMemos).mockReturnValueOnce({
			data: [{ id: 'memo-1', title: '削除済みメモ', trashedAt }],
			isLoading: false,
		} as unknown as ReturnType<typeof useTrashMemos>);

		render(<TrashView />);

		expect(screen.getByText(`${TRASH_RETENTION_DAYS - daysElapsed} 日`)).toBeTruthy();
	});

	it('保持期間を過ぎたメモの残り日数は負にならず 0 で止まる', () => {
		const trashedAt = new Date(
			Date.now() - (TRASH_RETENTION_DAYS + 5) * 24 * 60 * 60 * 1000,
		).toISOString();
		vi.mocked(useTrashMemos).mockReturnValueOnce({
			data: [{ id: 'memo-1', title: '削除済みメモ', trashedAt }],
			isLoading: false,
		} as unknown as ReturnType<typeof useTrashMemos>);

		render(<TrashView />);

		expect(screen.getByText('0 日')).toBeTruthy();
	});
});

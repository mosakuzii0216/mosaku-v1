import { Prisma } from '@prisma/client';

describe('Memo public sharing schema (Phase 0)', () => {
	it('exposes publicToken and publishedAt on the Memo type', () => {
		const memo: Prisma.MemoUncheckedCreateInput = {
			id: 'memo-1',
			title: 't',
			content: 'c',
			userId: 'user-1',
			publicToken: 'token-1',
			publishedAt: new Date(),
		};

		expect(memo.publicToken).toBe('token-1');
		expect(memo.publishedAt).toBeInstanceOf(Date);
	});

	it('allows publicToken and publishedAt to be null (default non-published state)', () => {
		const memo: Prisma.MemoUncheckedCreateInput = {
			id: 'memo-2',
			title: 't',
			content: 'c',
			userId: 'user-1',
			publicToken: null,
			publishedAt: null,
		};

		expect(memo.publicToken).toBeNull();
		expect(memo.publishedAt).toBeNull();
	});
});

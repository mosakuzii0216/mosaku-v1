import { ERROR_CODES } from '../../common/exceptions';
import {
	PrismaQuotaPolicy,
	QUOTA_POLICY,
	QuotaPolicy,
	QuotaPolicyTransactionClient,
} from './quota-policy';

type UserUpdateManyMock = jest.Mock<
	Promise<{ count: number }>,
	[
		{
			where: {
				id: string;
				role: 'USER';
				invitationQuota: { gt: number };
			};
			data: { invitationQuota: { decrement: number } };
		},
	]
>;

function buildTx(count: number): {
	tx: QuotaPolicyTransactionClient;
	updateMany: UserUpdateManyMock;
} {
	const updateMany = jest.fn().mockResolvedValue({ count }) as UserUpdateManyMock;
	const tx = { user: { updateMany } } as unknown as QuotaPolicyTransactionClient;
	return { tx, updateMany };
}

describe('QuotaPolicy (PrismaQuotaPolicy)', () => {
	const policy: QuotaPolicy = new PrismaQuotaPolicy();

	describe('QUOTA_POLICY DI トークン', () => {
		it('Symbol で公開され、DI 識別子として利用できること', () => {
			expect(typeof QUOTA_POLICY).toBe('symbol');
		});
	});

	describe('ADMIN ロール', () => {
		it('quota を一切参照せず { allowed: true, consumed: false } を返すこと', async () => {
			const { tx, updateMany } = buildTx(0);
			const decision = await policy.evaluateAndConsume(tx, {
				id: 'admin-1',
				role: 'ADMIN',
			});
			expect(decision).toEqual({ allowed: true, consumed: false });
			expect(updateMany).not.toHaveBeenCalled();
		});
	});

	describe('USER ロール（quota > 0）', () => {
		it('updateMany で 1 件減算され、{ allowed: true, consumed: true } を返すこと', async () => {
			const { tx, updateMany } = buildTx(1);
			const decision = await policy.evaluateAndConsume(tx, {
				id: 'user-1',
				role: 'USER',
			});
			expect(decision).toEqual({ allowed: true, consumed: true });
			expect(updateMany).toHaveBeenCalledTimes(1);
		});

		it('updateMany の where に id / role: USER / invitationQuota > 0 を全て含むこと', async () => {
			const { tx, updateMany } = buildTx(1);
			await policy.evaluateAndConsume(tx, { id: 'user-42', role: 'USER' });
			const arg = updateMany.mock.calls[0][0];
			expect(arg.where.id).toBe('user-42');
			expect(arg.where.role).toBe('USER');
			expect(arg.where.invitationQuota).toEqual({ gt: 0 });
		});

		it('updateMany の data が decrement: 1 で invitationQuota を減算すること', async () => {
			const { tx, updateMany } = buildTx(1);
			await policy.evaluateAndConsume(tx, { id: 'user-1', role: 'USER' });
			const arg = updateMany.mock.calls[0][0];
			expect(arg.data.invitationQuota).toEqual({ decrement: 1 });
		});
	});

	describe('USER ロール（quota == 0、楽観ロック競合含む）', () => {
		it('updateMany が 0 件 → { allowed: false, code: QUOTA_EXHAUSTED } を返すこと', async () => {
			const { tx } = buildTx(0);
			const decision = await policy.evaluateAndConsume(tx, {
				id: 'user-x',
				role: 'USER',
			});
			expect(decision).toEqual({
				allowed: false,
				code: ERROR_CODES.INVITATION.QUOTA_EXHAUSTED,
			});
		});

		it('QUOTA_EXHAUSTED のコード値が INV005 であること（型レベル整合）', async () => {
			const { tx } = buildTx(0);
			const decision = await policy.evaluateAndConsume(tx, {
				id: 'user-x',
				role: 'USER',
			});
			if (!decision.allowed) {
				expect(decision.code).toBe('INV005');
			} else {
				throw new Error('expected denied decision');
			}
		});
	});
});

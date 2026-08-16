import type { Prisma, User } from '@prisma/client';

describe('User schema - invitationQuota', () => {
	it('Prisma User 型に invitationQuota: number フィールドが存在すること', () => {
		const user: Pick<User, 'invitationQuota'> = { invitationQuota: 5 };
		expect(user.invitationQuota).toBe(5);
	});

	it('UserCreateInput の invitationQuota は省略可能（デフォルト値 5 が DB 側で適用される）', () => {
		const input: Prisma.UserCreateInput = { email: 'test@example.com' };
		expect(input.invitationQuota).toBeUndefined();
	});

	it('UserCreateInput に invitationQuota を明示的に渡せること', () => {
		const input: Prisma.UserCreateInput = {
			email: 'admin@example.com',
			invitationQuota: 999,
		};
		expect(input.invitationQuota).toBe(999);
	});
});

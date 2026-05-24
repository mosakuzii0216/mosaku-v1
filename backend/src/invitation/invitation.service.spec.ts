import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { AppException, ERROR_CODES } from '../common/exceptions';
import { AuthorizationService } from '../common/services/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvitationService } from './invitation.service';
import { CODE_GENERATOR, type CodeGenerator } from './utils/code-generator';
import { QUOTA_POLICY, type QuotaPolicy } from './utils/quota-policy';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('InvitationService', () => {
	let service: InvitationService;
	let prisma: {
		invitationCode: Mocked<{
			findUnique: unknown;
			findMany: unknown;
			create: unknown;
			update: unknown;
			delete: unknown;
			findFirst: unknown;
		}>;
		user: Mocked<{ findUnique: unknown }>;
		$transaction: jest.Mock;
	};
	let codeGenerator: Mocked<CodeGenerator>;
	let quotaPolicy: Mocked<QuotaPolicy>;
	let authorizationService: AuthorizationService;
	let txMock: {
		invitationCode: Mocked<{ create: unknown }>;
		user: Mocked<{ updateMany: unknown }>;
	};

	beforeEach(async () => {
		prisma = {
			invitationCode: {
				findUnique: jest.fn(),
				findMany: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
				delete: jest.fn(),
				findFirst: jest.fn(),
			},
			user: { findUnique: jest.fn() },
			$transaction: jest.fn(),
		};
		txMock = {
			invitationCode: { create: jest.fn() },
			user: { updateMany: jest.fn() },
		};
		// default: run callback with txMock
		prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
			cb(txMock),
		);
		codeGenerator = {
			generate: jest.fn().mockReturnValue('abcde12345'),
			isLegacyFormat: jest.fn().mockReturnValue(false),
		};
		quotaPolicy = {
			evaluateAndConsume: jest.fn(),
		};

		const moduleRef: TestingModule = await Test.createTestingModule({
			providers: [
				InvitationService,
				AuthorizationService,
				{ provide: PrismaService, useValue: prisma },
				{ provide: CODE_GENERATOR, useValue: codeGenerator },
				{ provide: QUOTA_POLICY, useValue: quotaPolicy },
			],
		}).compile();

		service = moduleRef.get(InvitationService);
		authorizationService = moduleRef.get(AuthorizationService);
		void authorizationService;
	});

	const baseInvitation = {
		id: 'inv-1',
		code: 'abcde12345',
		maxUses: 1,
		usedCount: 0,
		expiresAt: null as Date | null,
		createdAt: new Date('2026-01-01'),
		updatedAt: new Date('2026-01-01'),
		createdById: 'user-cuid-abcdefghi',
	};

	describe('verifyInvitation', () => {
		it('新 10 文字 nanoid コードを受理し InvitationContext を返却する', async () => {
			prisma.invitationCode.findUnique.mockResolvedValue({
				...baseInvitation,
				maxUses: 3,
				usedCount: 1,
			});
			prisma.user.findUnique.mockResolvedValue({ id: 'user-cuid-abcdefghi', name: 'Marin' });

			const result = await service.verifyInvitation('abcde12345');

			expect(result).toEqual({
				code: 'abcde12345',
				status: 'valid',
				creator: {
					id: 'user-cuid-abcdefghi',
					name: 'Marin',
					maskedId: 'user***',
				},
				expiresAt: null,
				usesRemaining: 2,
			});
			expect(prisma.user.findUnique).toHaveBeenCalledWith({
				where: { id: 'user-cuid-abcdefghi' },
				select: expect.objectContaining({ id: true, name: true }),
			});
			// PII (email) を select に含めない
			const selectArg = prisma.user.findUnique.mock.calls[0][0].select;
			expect(selectArg.email).toBeUndefined();
		});

		it('旧 32 文字 hex コードを同一ロジックで受理する（後方互換）', async () => {
			const legacyCode = 'ABCDEF0123456789ABCDEF0123456789';
			prisma.invitationCode.findUnique.mockResolvedValue({
				...baseInvitation,
				code: legacyCode,
			});
			prisma.user.findUnique.mockResolvedValue({ id: 'user-cuid-abcdefghi', name: null });

			const result = await service.verifyInvitation(legacyCode);

			expect(prisma.invitationCode.findUnique).toHaveBeenCalledWith({
				where: { code: legacyCode },
			});
			expect(result.code).toBe(legacyCode);
			expect(result.creator.name).toBeNull();
		});

		it('存在しないコードで INVALID_CODE を throw', async () => {
			prisma.invitationCode.findUnique.mockResolvedValue(null);

			await expect(service.verifyInvitation('nope')).rejects.toMatchObject({
				code: ERROR_CODES.INVITATION.INVALID_CODE,
			});
		});

		it('expiresAt が過去なら EXPIRED を throw', async () => {
			prisma.invitationCode.findUnique.mockResolvedValue({
				...baseInvitation,
				expiresAt: new Date('2020-01-01'),
			});

			await expect(service.verifyInvitation('expired')).rejects.toMatchObject({
				code: ERROR_CODES.INVITATION.EXPIRED,
			});
		});

		it('usedCount >= maxUses で MAX_USES_REACHED を throw', async () => {
			prisma.invitationCode.findUnique.mockResolvedValue({
				...baseInvitation,
				maxUses: 1,
				usedCount: 1,
			});

			await expect(service.verifyInvitation('maxed')).rejects.toMatchObject({
				code: ERROR_CODES.INVITATION.MAX_USES_REACHED,
			});
		});

		it('creator.maskedId は createdById の先頭 4 文字 + ***', async () => {
			prisma.invitationCode.findUnique.mockResolvedValue({
				...baseInvitation,
				createdById: 'cuidXYZ',
			});
			prisma.user.findUnique.mockResolvedValue({ id: 'cuidXYZ', name: 'X' });

			const result = await service.verifyInvitation('abcde12345');

			expect(result.creator.maskedId).toBe('cuid***');
		});
	});

	describe('useInvitation', () => {
		it('検証通過時に usedCount を 1 増やす', async () => {
			prisma.invitationCode.findUnique.mockResolvedValue({
				...baseInvitation,
				usedCount: 2,
				maxUses: 5,
			});

			await service.useInvitation('abcde12345');

			expect(prisma.invitationCode.update).toHaveBeenCalledWith({
				where: { id: 'inv-1' },
				data: { usedCount: 3 },
			});
		});

		it('検証失敗時は update を呼ばずに throw', async () => {
			prisma.invitationCode.findUnique.mockResolvedValue(null);

			await expect(service.useInvitation('nope')).rejects.toMatchObject({
				code: ERROR_CODES.INVITATION.INVALID_CODE,
			});
			expect(prisma.invitationCode.update).not.toHaveBeenCalled();
		});

		it('戻り値は void', async () => {
			prisma.invitationCode.findUnique.mockResolvedValue({ ...baseInvitation });
			prisma.invitationCode.update.mockResolvedValue({ ...baseInvitation, usedCount: 1 });

			const result = await service.useInvitation('abcde12345');

			expect(result).toBeUndefined();
		});
	});

	describe('createForUser', () => {
		it('USER: quota 1 減算 + 招待発行を同一トランザクションで完了する', async () => {
			quotaPolicy.evaluateAndConsume.mockResolvedValue({ allowed: true, consumed: true });
			txMock.invitationCode.create.mockResolvedValue({ ...baseInvitation });

			const result = await service.createForUser({ id: 'user-cuid-abcdefghi', role: 'USER' });

			expect(prisma.$transaction).toHaveBeenCalledTimes(1);
			expect(quotaPolicy.evaluateAndConsume).toHaveBeenCalledWith(txMock, {
				id: 'user-cuid-abcdefghi',
				role: 'USER',
			});
			expect(codeGenerator.generate).toHaveBeenCalledTimes(1);
			expect(txMock.invitationCode.create).toHaveBeenCalledWith({
				data: {
					code: 'abcde12345',
					maxUses: 1,
					createdById: 'user-cuid-abcdefghi',
				},
			});
			expect(result).toEqual(baseInvitation);
		});

		it('ADMIN: quota 非減算でコード発行（QuotaPolicy が consumed:false で戻る）', async () => {
			quotaPolicy.evaluateAndConsume.mockResolvedValue({ allowed: true, consumed: false });
			txMock.invitationCode.create.mockResolvedValue({ ...baseInvitation, createdById: 'admin-1' });

			const result = await service.createForUser({ id: 'admin-1', role: 'ADMIN' });

			expect(quotaPolicy.evaluateAndConsume).toHaveBeenCalledWith(txMock, {
				id: 'admin-1',
				role: 'ADMIN',
			});
			expect(result.createdById).toBe('admin-1');
		});

		it('quota 不足時は QUOTA_EXHAUSTED を throw し create は呼ばれない', async () => {
			quotaPolicy.evaluateAndConsume.mockResolvedValue({
				allowed: false,
				code: ERROR_CODES.INVITATION.QUOTA_EXHAUSTED,
			});

			await expect(
				service.createForUser({ id: 'user-cuid-abcdefghi', role: 'USER' }),
			).rejects.toMatchObject({
				code: ERROR_CODES.INVITATION.QUOTA_EXHAUSTED,
			});
			expect(txMock.invitationCode.create).not.toHaveBeenCalled();
		});

		it('unique 衝突時は最大 3 回リトライする', async () => {
			quotaPolicy.evaluateAndConsume.mockResolvedValue({ allowed: true, consumed: true });
			const uniqueErr = new Prisma.PrismaClientKnownRequestError('unique', {
				code: 'P2002',
				clientVersion: 'test',
			});
			txMock.invitationCode.create
				.mockRejectedValueOnce(uniqueErr)
				.mockRejectedValueOnce(uniqueErr)
				.mockResolvedValueOnce({ ...baseInvitation, code: 'success-cd' });

			const result = await service.createForUser({ id: 'user-cuid-abcdefghi', role: 'USER' });

			expect(prisma.$transaction).toHaveBeenCalledTimes(3);
			expect(codeGenerator.generate).toHaveBeenCalledTimes(3);
			expect(result.code).toBe('success-cd');
		});

		it('3 回連続で unique 衝突した場合は最後の Prisma 例外を伝播', async () => {
			quotaPolicy.evaluateAndConsume.mockResolvedValue({ allowed: true, consumed: true });
			const uniqueErr = new Prisma.PrismaClientKnownRequestError('unique', {
				code: 'P2002',
				clientVersion: 'test',
			});
			txMock.invitationCode.create.mockRejectedValue(uniqueErr);

			await expect(service.createForUser({ id: 'user-cuid-abcdefghi', role: 'USER' })).rejects.toBe(
				uniqueErr,
			);
			expect(prisma.$transaction).toHaveBeenCalledTimes(3);
		});

		it('unique 以外の例外はリトライせず即座に伝播', async () => {
			quotaPolicy.evaluateAndConsume.mockResolvedValue({ allowed: true, consumed: true });
			const otherErr = new Error('boom');
			txMock.invitationCode.create.mockRejectedValue(otherErr);

			await expect(service.createForUser({ id: 'user-cuid-abcdefghi', role: 'USER' })).rejects.toBe(
				otherErr,
			);
			expect(prisma.$transaction).toHaveBeenCalledTimes(1);
		});
	});

	describe('getMyInvitations', () => {
		it('createdById = userId の招待を createdAt 降順で返却', async () => {
			const records = [{ ...baseInvitation }];
			prisma.invitationCode.findMany.mockResolvedValue(records);

			const result = await service.getMyInvitations('user-1');

			expect(prisma.invitationCode.findMany).toHaveBeenCalledWith({
				where: { createdById: 'user-1' },
				orderBy: { createdAt: 'desc' },
			});
			expect(result).toBe(records);
		});
	});

	describe('getMyQuota', () => {
		it('USER ロール: { invitationQuota, unlimited:false, role:USER }', async () => {
			prisma.user.findUnique.mockResolvedValue({ invitationQuota: 3, role: 'USER' });

			const result = await service.getMyQuota('user-1');

			expect(result).toEqual({ invitationQuota: 3, unlimited: false, role: 'USER' });
		});

		it('ADMIN ロール: unlimited:true を返却', async () => {
			prisma.user.findUnique.mockResolvedValue({ invitationQuota: 5, role: 'ADMIN' });

			const result = await service.getMyQuota('admin-1');

			expect(result).toEqual({ invitationQuota: 5, unlimited: true, role: 'ADMIN' });
		});

		it('User 不存在で USER_NOT_FOUND を throw', async () => {
			prisma.user.findUnique.mockResolvedValue(null);

			await expect(service.getMyQuota('missing')).rejects.toMatchObject({
				code: ERROR_CODES.AUTH.USER_NOT_FOUND,
			});
		});
	});

	describe('deleteMyInvitation', () => {
		it('所有者が自分なら usedCount > 0 でも削除する', async () => {
			prisma.invitationCode.findUnique.mockResolvedValue({
				...baseInvitation,
				usedCount: 1,
				createdById: 'owner-1',
			});

			await service.deleteMyInvitation('inv-1', 'owner-1');

			expect(prisma.invitationCode.delete).toHaveBeenCalledWith({ where: { id: 'inv-1' } });
		});

		it('存在しない id で NOT_FOUND を throw', async () => {
			prisma.invitationCode.findUnique.mockResolvedValue(null);

			await expect(service.deleteMyInvitation('missing', 'owner-1')).rejects.toBeInstanceOf(
				AppException,
			);
			expect(prisma.invitationCode.delete).not.toHaveBeenCalled();
		});

		it('他人の所有なら NOT_OWNER (Forbidden) を throw', async () => {
			prisma.invitationCode.findUnique.mockResolvedValue({
				...baseInvitation,
				createdById: 'other',
			});

			await expect(service.deleteMyInvitation('inv-1', 'owner-1')).rejects.toMatchObject({
				code: ERROR_CODES.AUTHZ.NOT_OWNER,
			});
			expect(prisma.invitationCode.delete).not.toHaveBeenCalled();
		});
	});

	describe('findValidInvitation (public for legacy controller)', () => {
		it('正常系で InvitationCode を返却する', async () => {
			prisma.invitationCode.findUnique.mockResolvedValue({ ...baseInvitation });

			const result = await service.findValidInvitation('abcde12345');

			expect(result.id).toBe('inv-1');
		});
	});
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '../config/config.service';
import { ERROR_CODES, AppException } from '../common/exceptions';
import type { AuthenticatedRequest } from '../auth/types';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';

type Mocked<T> = { [K in keyof T]: jest.Mock };

describe('InvitationController', () => {
	let controller: InvitationController;
	let service: Mocked<InvitationService>;
	let configService: { frontendUrl: string };

	beforeEach(async () => {
		service = {
			createInvitation: jest.fn(),
			findValidInvitation: jest.fn(),
			verifyInvitation: jest.fn(),
			useInvitation: jest.fn(),
			createForUser: jest.fn(),
			getMyInvitations: jest.fn(),
			getMyQuota: jest.fn(),
			deleteMyInvitation: jest.fn(),
			getInvitations: jest.fn(),
			getAllInvitations: jest.fn(),
			deleteInvitation: jest.fn(),
			deleteAnyInvitation: jest.fn(),
		};

		configService = { frontendUrl: 'https://app.example.com' };

		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [InvitationController],
			providers: [
				{ provide: InvitationService, useValue: service },
				{ provide: ConfigService, useValue: configService },
			],
		}).compile();

		controller = moduleRef.get(InvitationController);
	});

	const buildAuthReq = (id: string, role: 'USER' | 'ADMIN' = 'USER'): AuthenticatedRequest =>
		({
			user: {
				id,
				email: `${id}@example.com`,
				role,
				name: 'ignored',
			},
		}) as unknown as AuthenticatedRequest;

	describe('POST /invitation/verify-context', () => {
		it('成功時に PII を含まない InvitationContextResponse を返却（expiresAt は ISO8601 文字列）', async () => {
			const expiresAt = new Date('2026-12-31T00:00:00.000Z');
			service.verifyInvitation.mockResolvedValue({
				code: 'abcde12345',
				status: 'valid',
				creator: { id: 'user-cuid-xxxx', name: 'Marin', maskedId: 'user***' },
				expiresAt,
				usesRemaining: 1,
				perk: { type: 'none' },
			});

			const result = await controller.verifyInvitationContext({ code: 'abcde12345' });

			expect(service.verifyInvitation).toHaveBeenCalledWith('abcde12345');
			expect(result).toEqual({
				code: 'abcde12345',
				status: 'valid',
				creator: { name: 'Marin', maskedId: 'user***' },
				expiresAt: '2026-12-31T00:00:00.000Z',
				usesRemaining: 1,
				perk: { type: 'none' },
			});
			// PII (email, creator.id) を含めない
			expect((result.creator as Record<string, unknown>).id).toBeUndefined();
			expect((result.creator as Record<string, unknown>).email).toBeUndefined();
		});

		it('COMP perk が verify-context 応答に含まれる', async () => {
			service.verifyInvitation.mockResolvedValue({
				code: 'compcode01',
				status: 'valid',
				creator: { id: 'user-cuid-xxxx', name: 'Marin', maskedId: 'user***' },
				expiresAt: null,
				usesRemaining: 5,
				perk: { type: 'comp', months: 3 },
			});

			const result = await controller.verifyInvitationContext({ code: 'compcode01' });

			expect(result.perk).toEqual({ type: 'comp', months: 3 });
		});

		it('expiresAt が null の場合は null を返却', async () => {
			service.verifyInvitation.mockResolvedValue({
				code: 'abcde12345',
				status: 'valid',
				creator: { id: 'user-cuid-xxxx', name: null, maskedId: 'user***' },
				expiresAt: null,
				usesRemaining: 1,
				perk: { type: 'none' },
			});

			const result = await controller.verifyInvitationContext({ code: 'abcde12345' });

			expect(result.expiresAt).toBeNull();
			expect(result.creator.name).toBeNull();
		});

		it('Service が INVALID_CODE を throw した場合、そのまま伝播', async () => {
			service.verifyInvitation.mockRejectedValue(
				new AppException(ERROR_CODES.INVITATION.INVALID_CODE, 400),
			);

			await expect(controller.verifyInvitationContext({ code: 'nope12345' })).rejects.toMatchObject(
				{
					code: ERROR_CODES.INVITATION.INVALID_CODE,
				},
			);
		});
	});

	describe('POST /invitation/verify（旧 API・perk 非露出）', () => {
		it('COMP コードでも perkType / perkCompMonths / createdById が応答に含まれない', async () => {
			service.findValidInvitation.mockResolvedValue({
				id: 'inv-comp',
				code: 'compcode01',
				maxUses: 5,
				usedCount: 1,
				expiresAt: null,
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				updatedAt: new Date('2026-01-01T00:00:00.000Z'),
				createdById: 'admin-secret-id',
				perkType: 'COMP',
				perkCompMonths: 3,
			});

			const result = await controller.verifyInvitation({ code: 'compcode01' });

			const raw = result as unknown as Record<string, unknown>;
			expect(raw.perkType).toBeUndefined();
			expect(raw.perkCompMonths).toBeUndefined();
			expect(raw.createdById).toBeUndefined();
			// 必要な基本情報は含む
			expect(result.code).toBe('compcode01');
		});

		it('有効コードで基本情報（code / maxUses / usedCount / expiresAt）を返す', async () => {
			service.findValidInvitation.mockResolvedValue({
				id: 'inv-1',
				code: 'testcode01',
				maxUses: 3,
				usedCount: 1,
				expiresAt: new Date('2026-12-31T00:00:00.000Z'),
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				updatedAt: new Date('2026-01-01T00:00:00.000Z'),
				createdById: 'user-secret',
				perkType: 'NONE',
				perkCompMonths: null,
			});

			const result = await controller.verifyInvitation({ code: 'testcode01' });

			expect(result).toEqual({
				code: 'testcode01',
				maxUses: 3,
				usedCount: 1,
				expiresAt: '2026-12-31T00:00:00.000Z',
			});
		});
	});

	describe('POST /invitation/me', () => {
		it('maxUses 省略時: createForUser に { maxUses:1 } を渡し shareUrl 付きで返却', async () => {
			service.createForUser.mockResolvedValue({
				id: 'inv-1',
				code: 'newcode001',
				maxUses: 1,
				usedCount: 0,
				expiresAt: null,
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				createdById: 'user-1',
			});

			const result = await controller.createMyInvitation(
				{}, // body: maxUses 省略
				buildAuthReq('user-1', 'USER'),
			);

			expect(service.createForUser).toHaveBeenCalledWith(
				{ id: 'user-1', role: 'USER' },
				{ maxUses: 1 },
			);
			expect(result).toEqual({
				id: 'inv-1',
				code: 'newcode001',
				shareUrl: 'https://app.example.com/invite/newcode001',
				maxUses: 1,
				usedCount: 0,
				expiresAt: null,
				createdAt: '2026-01-01T00:00:00.000Z',
			});
		});

		it('maxUses=5 を body で受け取り createForUser に { maxUses:5 } を渡す', async () => {
			service.createForUser.mockResolvedValue({
				id: 'inv-2',
				code: 'campcode01',
				maxUses: 5,
				usedCount: 0,
				expiresAt: null,
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				createdById: 'user-1',
			});

			await controller.createMyInvitation({ maxUses: 5 }, buildAuthReq('user-1', 'USER'));

			expect(service.createForUser).toHaveBeenCalledWith(
				{ id: 'user-1', role: 'USER' },
				{ maxUses: 5 },
			);
		});

		it('QUOTA_EXHAUSTED は Service の throw をそのまま伝播', async () => {
			service.createForUser.mockRejectedValue(
				new AppException(ERROR_CODES.INVITATION.QUOTA_EXHAUSTED, 400),
			);

			await expect(
				controller.createMyInvitation({} as any, buildAuthReq('user-1')),
			).rejects.toMatchObject({
				code: ERROR_CODES.INVITATION.QUOTA_EXHAUSTED,
			});
		});

		it('INVALID_INPUT（同時有効数超過）は Service の throw をそのまま伝播', async () => {
			service.createForUser.mockRejectedValue(
				new AppException(ERROR_CODES.VALIDATION.INVALID_INPUT, 400),
			);

			await expect(
				controller.createMyInvitation({ maxUses: 3 } as any, buildAuthReq('user-1')),
			).rejects.toMatchObject({
				code: ERROR_CODES.VALIDATION.INVALID_INPUT,
			});
		});
	});

	describe('GET /invitation/me', () => {
		it('自分の招待一覧に shareUrl を付与して返却（PII なし）', async () => {
			service.getMyInvitations.mockResolvedValue([
				{
					id: 'inv-1',
					code: 'codeA00001',
					maxUses: 1,
					usedCount: 0,
					expiresAt: null,
					createdAt: new Date('2026-02-01T00:00:00.000Z'),
					createdById: 'user-1',
				},
				{
					id: 'inv-2',
					code: 'codeB00002',
					maxUses: 5,
					usedCount: 2,
					expiresAt: new Date('2026-12-31T00:00:00.000Z'),
					createdAt: new Date('2026-01-15T00:00:00.000Z'),
					createdById: 'user-1',
				},
			]);

			const result = await controller.getMyInvitations(buildAuthReq('user-1'));

			expect(service.getMyInvitations).toHaveBeenCalledWith('user-1');
			expect(result).toEqual([
				{
					id: 'inv-1',
					code: 'codeA00001',
					shareUrl: 'https://app.example.com/invite/codeA00001',
					maxUses: 1,
					usedCount: 0,
					expiresAt: null,
					createdAt: '2026-02-01T00:00:00.000Z',
				},
				{
					id: 'inv-2',
					code: 'codeB00002',
					shareUrl: 'https://app.example.com/invite/codeB00002',
					maxUses: 5,
					usedCount: 2,
					expiresAt: '2026-12-31T00:00:00.000Z',
					createdAt: '2026-01-15T00:00:00.000Z',
				},
			]);
		});
	});

	describe('GET /invitation/me/quota', () => {
		it('USER quota スナップショットを返却', async () => {
			service.getMyQuota.mockResolvedValue({
				invitationQuota: 3,
				unlimited: false,
				role: 'USER',
			});

			const result = await controller.getMyQuota(buildAuthReq('user-1'));

			expect(service.getMyQuota).toHaveBeenCalledWith('user-1');
			expect(result).toEqual({ invitationQuota: 3, unlimited: false, role: 'USER' });
		});

		it('ADMIN は unlimited:true', async () => {
			service.getMyQuota.mockResolvedValue({
				invitationQuota: 5,
				unlimited: true,
				role: 'ADMIN',
			});

			const result = await controller.getMyQuota(buildAuthReq('admin-1', 'ADMIN'));

			expect(result.unlimited).toBe(true);
			expect(result.role).toBe('ADMIN');
		});
	});

	describe('DELETE /invitation/me/:id', () => {
		it('Service.deleteMyInvitation に id と ownerId を渡す', async () => {
			service.deleteMyInvitation.mockResolvedValue(undefined);

			await controller.deleteMyInvitation('inv-1', buildAuthReq('user-1'));

			expect(service.deleteMyInvitation).toHaveBeenCalledWith('inv-1', 'user-1');
		});

		it('Service の NOT_OWNER を伝播', async () => {
			service.deleteMyInvitation.mockRejectedValue(
				new AppException(ERROR_CODES.AUTHZ.NOT_OWNER, 403),
			);

			await expect(
				controller.deleteMyInvitation('inv-1', buildAuthReq('user-1')),
			).rejects.toMatchObject({
				code: ERROR_CODES.AUTHZ.NOT_OWNER,
			});
		});
	});

	describe('POST /invitation (ADMIN)', () => {
		it('ADMIN 発行も shareUrl を付与して返却', async () => {
			service.createInvitation.mockResolvedValue({
				id: 'inv-admin',
				code: 'ADMINX0001',
				maxUses: 10,
				usedCount: 0,
				expiresAt: null,
				createdAt: new Date('2026-03-01T00:00:00.000Z'),
				createdById: 'admin-1',
			});

			const result = await controller.createInvitation(
				{ maxUses: 10 },
				buildAuthReq('admin-1', 'ADMIN'),
			);

			expect(service.createInvitation).toHaveBeenCalledWith({ maxUses: 10 }, 'admin-1');
			expect(result).toEqual({
				id: 'inv-admin',
				code: 'ADMINX0001',
				shareUrl: 'https://app.example.com/invite/ADMINX0001',
				maxUses: 10,
				usedCount: 0,
				expiresAt: null,
				createdAt: '2026-03-01T00:00:00.000Z',
			});
		});
	});

	describe('shareUrl ヘルパー（末尾スラッシュ正規化）', () => {
		it('frontendUrl 末尾スラッシュありでも二重スラッシュにならない', async () => {
			configService.frontendUrl = 'https://app.example.com/';
			service.createForUser.mockResolvedValue({
				id: 'inv-1',
				code: 'normCode01',
				maxUses: 1,
				usedCount: 0,
				expiresAt: null,
				createdAt: new Date('2026-04-01T00:00:00.000Z'),
				createdById: 'user-1',
			});

			const result = await controller.createMyInvitation({}, buildAuthReq('user-1'));

			expect(result.shareUrl).toBe('https://app.example.com/invite/normCode01');
		});

		it('frontendUrl 末尾複数スラッシュも正規化', async () => {
			configService.frontendUrl = 'https://app.example.com///';
			service.createForUser.mockResolvedValue({
				id: 'inv-1',
				code: 'normCode02',
				maxUses: 1,
				usedCount: 0,
				expiresAt: null,
				createdAt: new Date('2026-04-01T00:00:00.000Z'),
				createdById: 'user-1',
			});

			const result = await controller.createMyInvitation({}, buildAuthReq('user-1'));

			expect(result.shareUrl).toBe('https://app.example.com/invite/normCode02');
		});
	});
});

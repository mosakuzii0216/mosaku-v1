import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { MemoService } from './memo.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';

const mockMemo = (overrides = {}) => ({
	id: 'memo-1',
	title: 'Test Memo',
	content: 'Content',
	createdAt: new Date(),
	updatedAt: new Date(),
	trashedAt: null,
	userId: 'user-1',
	notebookId: null,
	memoTags: [],
	notebook: null,
	...overrides,
});

const mockPrismaService = {
	memo: {
		findFirst: jest.fn(),
		findMany: jest.fn(),
		update: jest.fn(),
		delete: jest.fn(),
		deleteMany: jest.fn(),
		count: jest.fn(),
		create: jest.fn(),
	},
};

describe('MemoService', () => {
	let service: MemoService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				MemoService,
				{ provide: PrismaService, useValue: mockPrismaService },
				AuthorizationService, // 実際の AuthorizationService を使用
			],
		}).compile();

		service = module.get<MemoService>(MemoService);
		jest.clearAllMocks();
	});

	// ─── trash() ────────────────────────────────────────────────────────────────

	describe('trash()', () => {
		it('should set trashedAt to current time', async () => {
			const memo = mockMemo();
			const trashedMemo = mockMemo({ trashedAt: new Date() });
			mockPrismaService.memo.findFirst.mockResolvedValue(memo);
			mockPrismaService.memo.update.mockResolvedValue(trashedMemo);

			const result = await service.trash('memo-1', 'user-1');

			expect(mockPrismaService.memo.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'memo-1' },
					data: { trashedAt: expect.any(Date) },
				}),
			);
			expect(result.trashedAt).not.toBeNull();
		});

		it('should throw 404 when memo does not exist', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(service.trash('nonexistent', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('should throw 403 when memo belongs to another user', async () => {
			const memo = mockMemo({ userId: 'other-user' });
			mockPrismaService.memo.findFirst.mockResolvedValue(memo);

			await expect(service.trash('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
		});
	});

	// ─── findAll() ──────────────────────────────────────────────────────────────

	describe('findAll()', () => {
		it('should exclude trashed memos (trashedAt: null condition)', async () => {
			const activeMemo = mockMemo();
			mockPrismaService.memo.findMany.mockResolvedValue([activeMemo]);

			await service.findAll('user-1');

			const [[callArgs]] = mockPrismaService.memo.findMany.mock.calls as Array<
				[{ where: { userId: string; trashedAt: null } }]
			>;
			expect(callArgs.where).toMatchObject({ userId: 'user-1', trashedAt: null });
		});

		it('should not return memos with trashedAt set', async () => {
			// DB 側フィルターはモックで表現：findMany は空配列を返す（ゴミ箱メモのみの状況）
			mockPrismaService.memo.findMany.mockResolvedValue([]);

			const result = await service.findAll('user-1');

			expect(result).toHaveLength(0);
		});
	});

	// ─── restore() ──────────────────────────────────────────────────────────────

	describe('restore()', () => {
		it('should set trashedAt back to null', async () => {
			const trashedMemo = mockMemo({ trashedAt: new Date() });
			const restoredMemo = mockMemo({ trashedAt: null });
			mockPrismaService.memo.findFirst.mockResolvedValue(trashedMemo);
			mockPrismaService.memo.update.mockResolvedValue(restoredMemo);

			const result = await service.restore('memo-1', 'user-1');

			expect(mockPrismaService.memo.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'memo-1' },
					data: { trashedAt: null },
				}),
			);
			expect(result.trashedAt).toBeNull();
		});

		it('should throw 404 when trashed memo does not exist', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(service.restore('nonexistent', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('should throw 403 when trashed memo belongs to another user', async () => {
			const trashedMemo = mockMemo({ trashedAt: new Date(), userId: 'other-user' });
			mockPrismaService.memo.findFirst.mockResolvedValue(trashedMemo);

			await expect(service.restore('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
		});
	});

	// ─── permanentDelete() ──────────────────────────────────────────────────────

	describe('permanentDelete()', () => {
		it('should throw 404 for non-existent trashed memo', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(service.permanentDelete('nonexistent', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('should throw 403 when memo belongs to another user', async () => {
			const trashedMemo = mockMemo({ trashedAt: new Date(), userId: 'other-user' });
			mockPrismaService.memo.findFirst.mockResolvedValue(trashedMemo);

			await expect(service.permanentDelete('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
		});
	});

	// ─── emptyTrash() ───────────────────────────────────────────────────────────

	describe('emptyTrash()', () => {
		it('should delete all trashed memos for the user', async () => {
			mockPrismaService.memo.deleteMany.mockResolvedValue({ count: 5 });

			const result = await service.emptyTrash('user-1');

			expect(mockPrismaService.memo.deleteMany).toHaveBeenCalledWith({
				where: { userId: 'user-1', trashedAt: { not: null } },
			});
			expect(result.count).toBe(5);
		});
	});

	// ─── update() with last-write-wins ─────────────────────────────────────────

	describe('update() — last-write-wins', () => {
		it('clientUpdatedAt 未指定時は従来通り無条件で上書きする', async () => {
			const memo = mockMemo({ updatedAt: new Date('2026-05-10T10:00:00.000Z') });
			const updated = mockMemo({ title: 'updated' });
			mockPrismaService.memo.findFirst.mockResolvedValue(memo);
			mockPrismaService.memo.update.mockResolvedValue(updated);

			const result = await service.update('memo-1', { title: 'updated' }, 'user-1');

			expect(mockPrismaService.memo.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'memo-1' },
					data: { title: 'updated' },
				}),
			);
			expect(result.title).toBe('updated');
		});

		it('clientUpdatedAt がサーバーより新しい場合は通常通り上書きする', async () => {
			const memo = mockMemo({ updatedAt: new Date('2026-05-10T10:00:00.000Z') });
			const updated = mockMemo({ title: 'newer' });
			mockPrismaService.memo.findFirst.mockResolvedValue(memo);
			mockPrismaService.memo.update.mockResolvedValue(updated);

			const result = await service.update(
				'memo-1',
				{ title: 'newer', clientUpdatedAt: '2026-05-10T11:00:00.000Z' },
				'user-1',
			);

			expect(mockPrismaService.memo.update).toHaveBeenCalled();
			expect(result.title).toBe('newer');
		});

		it('clientUpdatedAt と updatedAt が同一インスタント（タイムゾーン違い）でも更新する', async () => {
			// JST 19:00 == UTC 10:00 — 同じインスタント
			const memo = mockMemo({ updatedAt: new Date('2026-05-10T10:00:00.000Z') });
			const updated = mockMemo({ content: 'tz-test' });
			mockPrismaService.memo.findFirst.mockResolvedValue(memo);
			mockPrismaService.memo.update.mockResolvedValue(updated);

			await expect(
				service.update(
					'memo-1',
					{ content: 'tz-test', clientUpdatedAt: '2026-05-10T19:00:00.000+09:00' },
					'user-1',
				),
			).resolves.toEqual(updated);
		});

		it('clientUpdatedAt がサーバーより古い場合は 409 を投げ details.current に現在のメモを含める', async () => {
			const memo = mockMemo({ updatedAt: new Date('2026-05-10T11:00:00.000Z') });
			mockPrismaService.memo.findFirst.mockResolvedValue(memo);

			let caught: unknown = null;
			try {
				await service.update(
					'memo-1',
					{ content: 'stale', clientUpdatedAt: '2026-05-10T10:00:00.000Z' },
					'user-1',
				);
			} catch (e) {
				caught = e;
			}

			expect(caught).toBeTruthy();
			const err = caught as { statusCode: number; getResponse: () => unknown; code: string };
			expect(err.statusCode).toBe(HttpStatus.CONFLICT);
			expect(err.code).toBe('RES006');
			const body = err.getResponse() as { code: string; details?: { current: unknown } };
			expect(body.code).toBe('RES006');
			expect(body.details?.current).toEqual(memo);
			expect(mockPrismaService.memo.update).not.toHaveBeenCalled();
		});

		it('clientUpdatedAt 指定時も所有者が異なれば 403 を投げる（LWW より先に検証）', async () => {
			const memo = mockMemo({ userId: 'other-user', updatedAt: new Date() });
			mockPrismaService.memo.findFirst.mockResolvedValue(memo);

			await expect(
				service.update(
					'memo-1',
					{ title: 'X', clientUpdatedAt: '2026-05-10T10:00:00.000Z' },
					'user-1',
				),
			).rejects.toMatchObject({ statusCode: HttpStatus.FORBIDDEN });
			expect(mockPrismaService.memo.update).not.toHaveBeenCalled();
		});

		it('clientUpdatedAt 指定時もメモが存在しなければ 404 を投げる', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(
				service.update(
					'nonexistent',
					{ title: 'X', clientUpdatedAt: '2026-05-10T10:00:00.000Z' },
					'user-1',
				),
			).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND });
			expect(mockPrismaService.memo.update).not.toHaveBeenCalled();
		});
	});
});

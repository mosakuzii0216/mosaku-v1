import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { MemoService } from './memo.service';
import { MemoSharingService } from './memo-sharing.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';
import type { ProseMirrorDoc } from '../common/utils/prosemirror-types';

const emptyDoc: ProseMirrorDoc = { type: 'doc', content: [{ type: 'paragraph' }] };
const textDoc: ProseMirrorDoc = {
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }],
};

const mockMemo = (overrides: Record<string, unknown> = {}) => ({
	id: 'memo-1',
	title: 'Test Memo',
	content: emptyDoc as unknown,
	contentText: '',
	createdAt: new Date(),
	updatedAt: new Date(),
	trashedAt: null,
	userId: 'user-1',
	notebookId: null,
	publicToken: null,
	publishedAt: null,
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

const mockMemoSharingService = {
	unpublishIfPublished: jest.fn(),
};

describe('MemoService', () => {
	let service: MemoService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				MemoService,
				{ provide: PrismaService, useValue: mockPrismaService },
				{ provide: MemoSharingService, useValue: mockMemoSharingService },
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
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

		it('should call unpublishIfPublished before trashing a published memo', async () => {
			const publishedMemo = mockMemo({ publicToken: 'tok-abc', publishedAt: new Date() });
			const trashedMemo = mockMemo({ trashedAt: new Date(), publicToken: null, publishedAt: null });
			mockPrismaService.memo.findFirst.mockResolvedValue(publishedMemo);
			mockMemoSharingService.unpublishIfPublished.mockResolvedValue(undefined);
			mockPrismaService.memo.update.mockResolvedValue(trashedMemo);

			await service.trash('memo-1', 'user-1');

			expect(mockMemoSharingService.unpublishIfPublished).toHaveBeenCalledWith('memo-1', 'user-1');
			expect(mockMemoSharingService.unpublishIfPublished).toHaveBeenCalledTimes(1);
		});

		it('should call unpublishIfPublished even when memo is not published (no-op)', async () => {
			const unpublishedMemo = mockMemo({ publicToken: null, publishedAt: null });
			const trashedMemo = mockMemo({ trashedAt: new Date() });
			mockPrismaService.memo.findFirst.mockResolvedValue(unpublishedMemo);
			mockMemoSharingService.unpublishIfPublished.mockResolvedValue(undefined);
			mockPrismaService.memo.update.mockResolvedValue(trashedMemo);

			await service.trash('memo-1', 'user-1');

			expect(mockMemoSharingService.unpublishIfPublished).toHaveBeenCalledWith('memo-1', 'user-1');
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
			const updated = mockMemo({ content: textDoc });
			mockPrismaService.memo.findFirst.mockResolvedValue(memo);
			mockPrismaService.memo.update.mockResolvedValue(updated);

			await expect(
				service.update(
					'memo-1',
					{ content: textDoc, clientUpdatedAt: '2026-05-10T19:00:00.000+09:00' },
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
					{ content: textDoc, clientUpdatedAt: '2026-05-10T10:00:00.000Z' },
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

	// ─── create() — contentText 永続化 ─────────────────────────────────────────

	describe('create() — contentText 永続化', () => {
		it('content と contentText を同時に Prisma へ渡す', async () => {
			mockPrismaService.memo.create.mockResolvedValue(
				mockMemo({ content: textDoc, contentText: 'hello world' }),
			);

			await service.create({ title: 'Test', content: textDoc }, 'user-1');

			expect(mockPrismaService.memo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						content: textDoc,
						contentText: 'hello world',
					}) as unknown,
				}),
			);
		});

		it('空 doc の contentText は空文字になる', async () => {
			mockPrismaService.memo.create.mockResolvedValue(
				mockMemo({ content: emptyDoc, contentText: '' }),
			);

			await service.create({ title: 'Test', content: emptyDoc }, 'user-1');

			expect(mockPrismaService.memo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						contentText: '',
					}) as unknown,
				}),
			);
		});
	});

	// ─── update() — contentText 永続化 ─────────────────────────────────────────

	describe('update() — contentText 永続化', () => {
		it('content 更新時に contentText も同時に更新する', async () => {
			const existingMemo = mockMemo();
			mockPrismaService.memo.findFirst.mockResolvedValue(existingMemo);
			mockPrismaService.memo.update.mockResolvedValue(
				mockMemo({ content: textDoc, contentText: 'hello world' }),
			);

			await service.update('memo-1', { content: textDoc }, 'user-1');

			expect(mockPrismaService.memo.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						content: textDoc,
						contentText: 'hello world',
					}) as unknown,
				}),
			);
		});

		it('content なし更新では contentText を data に含めない', async () => {
			const existingMemo = mockMemo();
			mockPrismaService.memo.findFirst.mockResolvedValue(existingMemo);
			mockPrismaService.memo.update.mockResolvedValue(mockMemo({ title: 'new title' }));

			await service.update('memo-1', { title: 'new title' }, 'user-1');

			const updateCall = (
				mockPrismaService.memo.update.mock.calls as Array<[{ data: Record<string, unknown> }]>
			)[0][0];
			expect(updateCall.data).not.toHaveProperty('contentText');
		});
	});

	// ─── search() — contentText 検索 ───────────────────────────────────────────

	describe('search() — contentText で本文検索', () => {
		it('本文検索は contentText を対象にする（content ではない）', async () => {
			mockPrismaService.memo.findMany.mockResolvedValue([]);

			await service.search('hello', 'user-1');

			const [[callArgs]] = mockPrismaService.memo.findMany.mock.calls as Array<
				[{ where: { OR?: Array<Record<string, unknown>> } }]
			>;
			const orClauses = callArgs.where.OR ?? [];
			expect(orClauses.some((c) => 'contentText' in c)).toBe(true);
			expect(orClauses.every((c) => !('content' in c))).toBe(true);
		});

		it('searchPaginated も contentText を対象にする', async () => {
			mockPrismaService.memo.findMany.mockResolvedValue([]);
			mockPrismaService.memo.count.mockResolvedValue(0);

			await service.searchPaginated('hello', 'user-1', { page: 1, limit: 20 });

			const [[callArgs]] = mockPrismaService.memo.findMany.mock.calls as Array<
				[{ where: { OR?: Array<Record<string, unknown>> } }]
			>;
			const orClauses = callArgs.where.OR ?? [];
			expect(orClauses.some((c) => 'contentText' in c)).toBe(true);
			expect(orClauses.every((c) => !('content' in c))).toBe(true);
		});
	});
});

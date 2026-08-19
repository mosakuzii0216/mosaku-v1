import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { TagService } from './tag.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';

const mockTag = (overrides: Record<string, unknown> = {}) => ({
	id: 'tag-1',
	name: 'Test Tag',
	color: '#FF5733',
	userId: 'user-1',
	createdAt: new Date(),
	updatedAt: new Date(),
	...overrides,
});

const mockPrismaService = {
	tag: {
		findMany: jest.fn(),
		findUnique: jest.fn(),
		create: jest.fn(),
		update: jest.fn(),
		delete: jest.fn(),
	},
	memo: {
		findUnique: jest.fn(),
	},
	notebook: {
		findUnique: jest.fn(),
	},
	memoTag: {
		deleteMany: jest.fn(),
		createMany: jest.fn(),
		findMany: jest.fn(),
	},
	notebookTag: {
		deleteMany: jest.fn(),
		createMany: jest.fn(),
		findMany: jest.fn(),
	},
};

describe('TagService', () => {
	let service: TagService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				TagService,
				{ provide: PrismaService, useValue: mockPrismaService },
				AuthorizationService, // 実際の AuthorizationService を使用
			],
		}).compile();

		service = module.get<TagService>(TagService);
		jest.clearAllMocks();
	});

	// ─── create() ───────────────────────────────────────────────────────────────

	describe('create()', () => {
		it('should merge userId into the created tag data', async () => {
			const created = mockTag();
			mockPrismaService.tag.create.mockResolvedValue(created);

			const result = await service.create({ name: 'Test Tag', color: '#FF5733' }, 'user-1');

			expect(mockPrismaService.tag.create).toHaveBeenCalledWith({
				data: { name: 'Test Tag', color: '#FF5733', userId: 'user-1' },
			});
			expect(result).toBe(created);
		});
	});

	// ─── findAll() ──────────────────────────────────────────────────────────────

	describe('findAll()', () => {
		it('should scope the query to the user and order by name ascending', async () => {
			const tags = [mockTag()];
			mockPrismaService.tag.findMany.mockResolvedValue(tags);

			const result = await service.findAll('user-1');

			expect(mockPrismaService.tag.findMany).toHaveBeenCalledWith({
				where: { userId: 'user-1' },
				orderBy: { name: 'asc' },
			});
			expect(result).toBe(tags);
		});
	});

	// ─── findOne() ──────────────────────────────────────────────────────────────

	describe('findOne()', () => {
		it('should throw 404 when the tag does not exist', async () => {
			mockPrismaService.tag.findUnique.mockResolvedValue(null);

			await expect(service.findOne('nonexistent', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('should throw 403 when the tag belongs to another user', async () => {
			mockPrismaService.tag.findUnique.mockResolvedValue(mockTag({ userId: 'other-user' }));

			await expect(service.findOne('tag-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
		});

		it('should return the tag when owned by the requesting user', async () => {
			const tag = mockTag();
			mockPrismaService.tag.findUnique.mockResolvedValue(tag);

			await expect(service.findOne('tag-1', 'user-1')).resolves.toBe(tag);
		});
	});

	// ─── update() ───────────────────────────────────────────────────────────────

	describe('update()', () => {
		it('should verify ownership before updating', async () => {
			mockPrismaService.tag.findUnique.mockResolvedValue(mockTag({ userId: 'other-user' }));

			await expect(service.update('tag-1', { name: 'Renamed' }, 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
			expect(mockPrismaService.tag.update).not.toHaveBeenCalled();
		});

		it('should update the tag when owned by the requesting user', async () => {
			const updated = mockTag({ name: 'Renamed' });
			mockPrismaService.tag.findUnique.mockResolvedValue(mockTag());
			mockPrismaService.tag.update.mockResolvedValue(updated);

			const result = await service.update('tag-1', { name: 'Renamed' }, 'user-1');

			expect(mockPrismaService.tag.update).toHaveBeenCalledWith({
				where: { id: 'tag-1' },
				data: { name: 'Renamed' },
			});
			expect(result).toBe(updated);
		});
	});

	// ─── remove() ───────────────────────────────────────────────────────────────

	describe('remove()', () => {
		it('should not delete a tag owned by another user', async () => {
			mockPrismaService.tag.findUnique.mockResolvedValue(mockTag({ userId: 'other-user' }));

			await expect(service.remove('tag-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
			expect(mockPrismaService.tag.delete).not.toHaveBeenCalled();
		});

		it('should delete the tag when owned by the requesting user', async () => {
			const tag = mockTag();
			mockPrismaService.tag.findUnique.mockResolvedValue(tag);
			mockPrismaService.tag.delete.mockResolvedValue(tag);

			await service.remove('tag-1', 'user-1');

			expect(mockPrismaService.tag.delete).toHaveBeenCalledWith({ where: { id: 'tag-1' } });
		});
	});

	// ─── search() ───────────────────────────────────────────────────────────────

	describe('search()', () => {
		it('should fall back to findAll when the query is empty', async () => {
			const tags = [mockTag()];
			mockPrismaService.tag.findMany.mockResolvedValue(tags);

			const result = await service.search('', 'user-1');

			expect(mockPrismaService.tag.findMany).toHaveBeenCalledWith({
				where: { userId: 'user-1' },
				orderBy: { name: 'asc' },
			});
			expect(result).toBe(tags);
		});

		it('should perform a case-insensitive partial match scoped to the user', async () => {
			const tags = [mockTag()];
			mockPrismaService.tag.findMany.mockResolvedValue(tags);

			const result = await service.search('work', 'user-1');

			expect(mockPrismaService.tag.findMany).toHaveBeenCalledWith({
				where: {
					userId: 'user-1',
					name: { contains: 'work', mode: 'insensitive' },
				},
				orderBy: { name: 'asc' },
			});
			expect(result).toBe(tags);
		});
	});

	// ─── assignTagsToMemo() ─────────────────────────────────────────────────────

	describe('assignTagsToMemo()', () => {
		it('should throw 404 when the memo does not exist', async () => {
			mockPrismaService.memo.findUnique.mockResolvedValue(null);

			await expect(
				service.assignTagsToMemo('memo-1', { tagIds: ['tag-1'] }, 'user-1'),
			).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND });
		});

		it('should throw 403 when the memo belongs to another user', async () => {
			mockPrismaService.memo.findUnique.mockResolvedValue({ id: 'memo-1', userId: 'other-user' });

			await expect(
				service.assignTagsToMemo('memo-1', { tagIds: ['tag-1'] }, 'user-1'),
			).rejects.toMatchObject({ statusCode: HttpStatus.FORBIDDEN });
			expect(mockPrismaService.memoTag.deleteMany).not.toHaveBeenCalled();
		});

		it('should throw 403 when any of the tags does not belong to the user', async () => {
			mockPrismaService.memo.findUnique.mockResolvedValue({ id: 'memo-1', userId: 'user-1' });
			// tagIds は 2 件だが、自分のタグとして引けたのは 1 件だけ
			mockPrismaService.tag.findMany.mockResolvedValue([mockTag()]);

			await expect(
				service.assignTagsToMemo('memo-1', { tagIds: ['tag-1', 'tag-2'] }, 'user-1'),
			).rejects.toMatchObject({ statusCode: HttpStatus.FORBIDDEN });
			expect(mockPrismaService.memoTag.deleteMany).not.toHaveBeenCalled();
		});

		it('should replace existing relations and return the memo with its tags', async () => {
			const memoWithTags = { id: 'memo-1', userId: 'user-1', memoTags: [{ tag: mockTag() }] };
			mockPrismaService.memo.findUnique
				.mockResolvedValueOnce({ id: 'memo-1', userId: 'user-1' })
				.mockResolvedValueOnce(memoWithTags);
			mockPrismaService.tag.findMany.mockResolvedValue([mockTag()]);

			const result = await service.assignTagsToMemo('memo-1', { tagIds: ['tag-1'] }, 'user-1');

			expect(mockPrismaService.memoTag.deleteMany).toHaveBeenCalledWith({
				where: { memoId: 'memo-1' },
			});
			expect(mockPrismaService.memoTag.createMany).toHaveBeenCalledWith({
				data: [{ memoId: 'memo-1', tagId: 'tag-1' }],
			});
			expect(result).toBe(memoWithTags);
		});

		it('should clear all relations without creating any when tagIds is empty', async () => {
			mockPrismaService.memo.findUnique
				.mockResolvedValueOnce({ id: 'memo-1', userId: 'user-1' })
				.mockResolvedValueOnce({ id: 'memo-1', userId: 'user-1', memoTags: [] });
			mockPrismaService.tag.findMany.mockResolvedValue([]);

			await service.assignTagsToMemo('memo-1', { tagIds: [] }, 'user-1');

			expect(mockPrismaService.memoTag.deleteMany).toHaveBeenCalledWith({
				where: { memoId: 'memo-1' },
			});
			expect(mockPrismaService.memoTag.createMany).not.toHaveBeenCalled();
		});
	});

	// ─── getMemoTags() ──────────────────────────────────────────────────────────

	describe('getMemoTags()', () => {
		it('should throw 404 when the memo does not exist', async () => {
			mockPrismaService.memo.findUnique.mockResolvedValue(null);

			await expect(service.getMemoTags('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('should throw 403 when the memo belongs to another user', async () => {
			mockPrismaService.memo.findUnique.mockResolvedValue({ id: 'memo-1', userId: 'other-user' });

			await expect(service.getMemoTags('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
			expect(mockPrismaService.memoTag.findMany).not.toHaveBeenCalled();
		});

		it('should return the memo tags with the tag relation included', async () => {
			const memoTags = [{ memoId: 'memo-1', tagId: 'tag-1', tag: mockTag() }];
			mockPrismaService.memo.findUnique.mockResolvedValue({ id: 'memo-1', userId: 'user-1' });
			mockPrismaService.memoTag.findMany.mockResolvedValue(memoTags);

			const result = await service.getMemoTags('memo-1', 'user-1');

			expect(mockPrismaService.memoTag.findMany).toHaveBeenCalledWith({
				where: { memoId: 'memo-1' },
				include: { tag: true },
			});
			expect(result).toBe(memoTags);
		});
	});

	// ─── assignTagsToNotebook() ─────────────────────────────────────────────────

	describe('assignTagsToNotebook()', () => {
		it('should throw 404 when the notebook does not exist', async () => {
			mockPrismaService.notebook.findUnique.mockResolvedValue(null);

			await expect(
				service.assignTagsToNotebook('nb-1', { tagIds: ['tag-1'] }, 'user-1'),
			).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND });
		});

		it('should throw 403 when the notebook belongs to another user', async () => {
			mockPrismaService.notebook.findUnique.mockResolvedValue({ id: 'nb-1', userId: 'other-user' });

			await expect(
				service.assignTagsToNotebook('nb-1', { tagIds: ['tag-1'] }, 'user-1'),
			).rejects.toMatchObject({ statusCode: HttpStatus.FORBIDDEN });
			expect(mockPrismaService.notebookTag.deleteMany).not.toHaveBeenCalled();
		});

		it('should throw 403 when any of the tags does not belong to the user', async () => {
			mockPrismaService.notebook.findUnique.mockResolvedValue({ id: 'nb-1', userId: 'user-1' });
			mockPrismaService.tag.findMany.mockResolvedValue([mockTag()]);

			await expect(
				service.assignTagsToNotebook('nb-1', { tagIds: ['tag-1', 'tag-2'] }, 'user-1'),
			).rejects.toMatchObject({ statusCode: HttpStatus.FORBIDDEN });
			expect(mockPrismaService.notebookTag.deleteMany).not.toHaveBeenCalled();
		});

		it('should replace existing relations and return the notebook with its tags', async () => {
			const notebookWithTags = { id: 'nb-1', userId: 'user-1', notebookTags: [{ tag: mockTag() }] };
			mockPrismaService.notebook.findUnique
				.mockResolvedValueOnce({ id: 'nb-1', userId: 'user-1' })
				.mockResolvedValueOnce(notebookWithTags);
			mockPrismaService.tag.findMany.mockResolvedValue([mockTag()]);

			const result = await service.assignTagsToNotebook('nb-1', { tagIds: ['tag-1'] }, 'user-1');

			expect(mockPrismaService.notebookTag.deleteMany).toHaveBeenCalledWith({
				where: { notebookId: 'nb-1' },
			});
			expect(mockPrismaService.notebookTag.createMany).toHaveBeenCalledWith({
				data: [{ notebookId: 'nb-1', tagId: 'tag-1' }],
			});
			expect(result).toBe(notebookWithTags);
		});

		it('should clear all relations without creating any when tagIds is empty', async () => {
			mockPrismaService.notebook.findUnique
				.mockResolvedValueOnce({ id: 'nb-1', userId: 'user-1' })
				.mockResolvedValueOnce({ id: 'nb-1', userId: 'user-1', notebookTags: [] });
			mockPrismaService.tag.findMany.mockResolvedValue([]);

			await service.assignTagsToNotebook('nb-1', { tagIds: [] }, 'user-1');

			expect(mockPrismaService.notebookTag.deleteMany).toHaveBeenCalledWith({
				where: { notebookId: 'nb-1' },
			});
			expect(mockPrismaService.notebookTag.createMany).not.toHaveBeenCalled();
		});
	});

	// ─── getNotebookTags() ──────────────────────────────────────────────────────

	describe('getNotebookTags()', () => {
		it('should throw 404 when the notebook does not exist', async () => {
			mockPrismaService.notebook.findUnique.mockResolvedValue(null);

			await expect(service.getNotebookTags('nb-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('should throw 403 when the notebook belongs to another user', async () => {
			mockPrismaService.notebook.findUnique.mockResolvedValue({ id: 'nb-1', userId: 'other-user' });

			await expect(service.getNotebookTags('nb-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
			expect(mockPrismaService.notebookTag.findMany).not.toHaveBeenCalled();
		});

		it('should return the notebook tags with the tag relation included', async () => {
			const notebookTags = [{ notebookId: 'nb-1', tagId: 'tag-1', tag: mockTag() }];
			mockPrismaService.notebook.findUnique.mockResolvedValue({ id: 'nb-1', userId: 'user-1' });
			mockPrismaService.notebookTag.findMany.mockResolvedValue(notebookTags);

			const result = await service.getNotebookTags('nb-1', 'user-1');

			expect(mockPrismaService.notebookTag.findMany).toHaveBeenCalledWith({
				where: { notebookId: 'nb-1' },
				include: { tag: true },
			});
			expect(result).toBe(notebookTags);
		});
	});
});

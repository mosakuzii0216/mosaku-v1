import {
	Injectable,
	ConflictException,
	NotFoundException,
	ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { AssignTagsDto } from './dto/assign-tags.dto';

@Injectable()
export class TagService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly authorizationService: AuthorizationService,
	) {}

	async findAll(userId: string) {
		return this.prisma.tag.findMany({
			where: { userId },
			orderBy: {
				name: 'asc',
			},
		});
	}

	async findOne(id: string, userId: string) {
		const tag = await this.prisma.tag.findUnique({
			where: { id },
		});

		return this.authorizationService.validateOwnership(tag, userId, 'Tag');
	}

	async create(createTagDto: CreateTagDto, userId: string) {
		return this.prisma.tag.create({
			data: {
				...createTagDto,
				userId,
			},
		});
	}

	async update(id: string, updateTagDto: UpdateTagDto, userId: string) {
		const tag = await this.prisma.tag.findUnique({
			where: { id },
		});

		this.authorizationService.validateOwnership(tag, userId, 'Tag');

		return this.prisma.tag.update({
			where: { id },
			data: updateTagDto,
		});
	}

	async remove(id: string, userId: string) {
		const tag = await this.prisma.tag.findUnique({
			where: { id },
		});

		this.authorizationService.validateOwnership(tag, userId, 'Tag');

		return this.prisma.tag.delete({
			where: { id },
		});
	}

	async search(query: string, userId: string) {
		if (!query) {
			return this.findAll(userId);
		}

		return this.prisma.tag.findMany({
			where: {
				userId,
				name: {
					contains: query,
					mode: 'insensitive',
				},
			},
			orderBy: {
				name: 'asc',
			},
		});
	}

	async assignTagsToMemo(memoId: string, assignTagsDto: AssignTagsDto, userId: string) {
		// Verify memo ownership
		const memo = await this.prisma.memo.findUnique({
			where: { id: memoId },
		});

		if (!memo) {
			throw new NotFoundException(`Memo with ID ${memoId} not found`);
		}

		if (memo.userId !== userId) {
			throw new ForbiddenException('You can only modify your own memos');
		}

		// Verify all tags belong to the user
		const tags = await this.prisma.tag.findMany({
			where: {
				id: { in: assignTagsDto.tagIds },
				userId,
			},
		});

		if (tags.length !== assignTagsDto.tagIds.length) {
			throw new ForbiddenException('Some tags do not belong to you');
		}

		// Remove existing tags and add new ones
		await this.prisma.memoTag.deleteMany({
			where: { memoId },
		});

		if (assignTagsDto.tagIds.length > 0) {
			await this.prisma.memoTag.createMany({
				data: assignTagsDto.tagIds.map((tagId) => ({
					memoId,
					tagId,
				})),
			});
		}

		return this.prisma.memo.findUnique({
			where: { id: memoId },
			include: {
				memoTags: {
					include: {
						tag: true,
					},
				},
			},
		});
	}

	async getMemoTags(memoId: string, userId: string) {
		// Verify memo ownership
		const memo = await this.prisma.memo.findUnique({
			where: { id: memoId },
		});

		if (!memo) {
			throw new NotFoundException(`Memo with ID ${memoId} not found`);
		}

		if (memo.userId !== userId) {
			throw new ForbiddenException('You can only access your own memos');
		}

		return this.prisma.memoTag.findMany({
			where: { memoId },
			include: {
				tag: true,
			},
		});
	}

	// ==== Notebooks x Tags (mirror of memos) ====
	async assignTagsToNotebook(
		notebookId: string,
		assignTagsDto: AssignTagsDto,
		userId: string,
	) {
		// Verify notebook ownership
		const notebook = await this.prisma.notebook.findUnique({ where: { id: notebookId } });

		if (!notebook) {
			throw new NotFoundException(`Notebook with ID ${notebookId} not found`);
		}

		if (notebook.userId !== userId) {
			throw new ForbiddenException('You can only modify your own notebooks');
		}

		// Verify all tags belong to the user
		const tags = await this.prisma.tag.findMany({
			where: {
				id: { in: assignTagsDto.tagIds },
				userId,
			},
		});

		if (tags.length !== assignTagsDto.tagIds.length) {
			throw new ForbiddenException('Some tags do not belong to you');
		}

		// Replace all notebook tags with the provided set
		await this.prisma.notebookTag.deleteMany({ where: { notebookId } });

		if (assignTagsDto.tagIds.length > 0) {
			await this.prisma.notebookTag.createMany({
				data: assignTagsDto.tagIds.map((tagId) => ({ notebookId, tagId })),
			});
		}

		return this.prisma.notebook.findUnique({
			where: { id: notebookId },
			include: {
				notebookTags: { include: { tag: true } },
			},
		});
	}

	async getNotebookTags(notebookId: string, userId: string) {
		const notebook = await this.prisma.notebook.findUnique({ where: { id: notebookId } });
		if (!notebook) {
			throw new NotFoundException(`Notebook with ID ${notebookId} not found`);
		}
		if (notebook.userId !== userId) {
			throw new ForbiddenException('You can only access your own notebooks');
		}

		return this.prisma.notebookTag.findMany({
			where: { notebookId },
			include: { tag: true },
		});
	}
}

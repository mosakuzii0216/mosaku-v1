import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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

	private async assignTagsToEntity(
		entityId: string,
		assignTagsDto: AssignTagsDto,
		userId: string,
		entityType: 'memo' | 'notebook',
	) {
		// エンティティの取得と所有権検証
		const entityModel = entityType === 'memo' ? this.prisma.memo : this.prisma.notebook;
		const entity = await entityModel.findUnique({ where: { id: entityId } });

		if (!entity) {
			const typeName = entityType === 'memo' ? 'Memo' : 'Notebook';
			throw new NotFoundException(`${typeName} with ID ${entityId} not found`);
		}

		if (entity.userId !== userId) {
			const typeName = entityType === 'memo' ? 'memos' : 'notebooks';
			throw new ForbiddenException(`You can only modify your own ${typeName}`);
		}

		// タグの所有権検証
		const tags = await this.prisma.tag.findMany({
			where: {
				id: { in: assignTagsDto.tagIds },
				userId,
			},
		});

		if (tags.length !== assignTagsDto.tagIds.length) {
			throw new ForbiddenException('Some tags do not belong to you');
		}

		// 既存のタグ関連を削除して新しい関連を作成
		const joinTableModel = entityType === 'memo' ? this.prisma.memoTag : this.prisma.notebookTag;
		const foreignKeyField = entityType === 'memo' ? 'memoId' : 'notebookId';

		await joinTableModel.deleteMany({
			where: { [foreignKeyField]: entityId },
		});

		if (assignTagsDto.tagIds.length > 0) {
			await joinTableModel.createMany({
				data: assignTagsDto.tagIds.map((tagId) => ({
					[foreignKeyField]: entityId,
					tagId,
				})),
			});
		}

		// 更新後のエンティティを返却
		const includeField = entityType === 'memo' ? 'memoTags' : 'notebookTags';
		return entityModel.findUnique({
			where: { id: entityId },
			include: {
				[includeField]: {
					include: {
						tag: true,
					},
				},
			},
		});
	}

	async assignTagsToMemo(memoId: string, assignTagsDto: AssignTagsDto, userId: string) {
		return this.assignTagsToEntity(memoId, assignTagsDto, userId, 'memo');
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
	async assignTagsToNotebook(notebookId: string, assignTagsDto: AssignTagsDto, userId: string) {
		return this.assignTagsToEntity(notebookId, assignTagsDto, userId, 'notebook');
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

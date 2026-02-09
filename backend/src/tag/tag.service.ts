import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';
import { BaseOwnableService, PrismaModelDelegate } from '../common/services/base-ownable.service';
import { ERROR_CODES, throwForbidden, throwNotFound } from '../common/exceptions';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { AssignTagsDto } from './dto/assign-tags.dto';
import type { Tag } from '@prisma/client';

type TagWithRelations = Tag & { userId: string };

@Injectable()
export class TagService extends BaseOwnableService<TagWithRelations> {
	constructor(prisma: PrismaService, authorizationService: AuthorizationService) {
		super(prisma, authorizationService);
	}

	protected getModelDelegate(): PrismaModelDelegate<TagWithRelations> {
		return this.prisma.tag as unknown as PrismaModelDelegate<TagWithRelations>;
	}

	protected getEntityName(): string {
		return 'Tag';
	}

	protected getDefaultOrderBy() {
		return { name: 'asc' as const };
	}

	async create(createTagDto: CreateTagDto, userId: string) {
		return this.createBase({
			...createTagDto,
			userId,
		});
	}

	async update(id: string, updateTagDto: UpdateTagDto, userId: string) {
		return this.updateBase(id, updateTagDto, userId);
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
			orderBy: this.getDefaultOrderBy(),
		});
	}

	private async assignTagsToEntity(
		entityId: string,
		assignTagsDto: AssignTagsDto,
		userId: string,
		entityType: 'memo' | 'notebook',
	) {
		// エンティティの取得と所有権検証
		if (entityType === 'memo') {
			const entity = await this.prisma.memo.findUnique({ where: { id: entityId } });

			if (!entity) {
				throwNotFound(ERROR_CODES.RESOURCE.NOT_FOUND, `Memo with ID ${entityId} not found`);
			}

			if (entity.userId !== userId) {
				throwForbidden(ERROR_CODES.AUTHZ.NOT_OWNER);
			}

			// タグの所有権検証
			const tags = await this.prisma.tag.findMany({
				where: {
					id: { in: assignTagsDto.tagIds },
					userId,
				},
			});

			if (tags.length !== assignTagsDto.tagIds.length) {
				throwForbidden(ERROR_CODES.AUTHZ.NOT_OWNER, 'Some tags do not belong to you');
			}

			// 既存のタグ関連を削除して新しい関連を作成
			await this.prisma.memoTag.deleteMany({
				where: { memoId: entityId },
			});

			if (assignTagsDto.tagIds.length > 0) {
				await this.prisma.memoTag.createMany({
					data: assignTagsDto.tagIds.map((tagId) => ({
						memoId: entityId,
						tagId,
					})),
				});
			}

			// 更新後のエンティティを返却
			return this.prisma.memo.findUnique({
				where: { id: entityId },
				include: {
					memoTags: {
						include: {
							tag: true,
						},
					},
				},
			});
		} else {
			const entity = await this.prisma.notebook.findUnique({ where: { id: entityId } });

			if (!entity) {
				throwNotFound(ERROR_CODES.RESOURCE.NOT_FOUND, `Notebook with ID ${entityId} not found`);
			}

			if (entity.userId !== userId) {
				throwForbidden(ERROR_CODES.AUTHZ.NOT_OWNER);
			}

			// タグの所有権検証
			const tags = await this.prisma.tag.findMany({
				where: {
					id: { in: assignTagsDto.tagIds },
					userId,
				},
			});

			if (tags.length !== assignTagsDto.tagIds.length) {
				throwForbidden(ERROR_CODES.AUTHZ.NOT_OWNER, 'Some tags do not belong to you');
			}

			// 既存のタグ関連を削除して新しい関連を作成
			await this.prisma.notebookTag.deleteMany({
				where: { notebookId: entityId },
			});

			if (assignTagsDto.tagIds.length > 0) {
				await this.prisma.notebookTag.createMany({
					data: assignTagsDto.tagIds.map((tagId) => ({
						notebookId: entityId,
						tagId,
					})),
				});
			}

			// 更新後のエンティティを返却
			return this.prisma.notebook.findUnique({
				where: { id: entityId },
				include: {
					notebookTags: {
						include: {
							tag: true,
						},
					},
				},
			});
		}
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
			throwNotFound(ERROR_CODES.RESOURCE.NOT_FOUND, `Memo with ID ${memoId} not found`);
		}

		if (memo.userId !== userId) {
			throwForbidden(ERROR_CODES.AUTHZ.NOT_OWNER);
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
			throwNotFound(ERROR_CODES.RESOURCE.NOT_FOUND, `Notebook with ID ${notebookId} not found`);
		}
		if (notebook.userId !== userId) {
			throwForbidden(ERROR_CODES.AUTHZ.NOT_OWNER);
		}

		return this.prisma.notebookTag.findMany({
			where: { notebookId },
			include: { tag: true },
		});
	}
}

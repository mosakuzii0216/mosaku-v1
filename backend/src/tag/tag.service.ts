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

	/**
	 * タグ付け対象（メモ / ノートブック）の存在と所有権を検証する。
	 */
	private assertOwnedTaggable(
		entity: { userId: string } | null,
		entityName: string,
		entityId: string,
		userId: string,
	): void {
		if (!entity) {
			throwNotFound(ERROR_CODES.RESOURCE.NOT_FOUND, `${entityName} with ID ${entityId} not found`);
		}

		if (entity.userId !== userId) {
			throwForbidden(ERROR_CODES.AUTHZ.NOT_OWNER);
		}
	}

	/**
	 * 割り当てようとしているタグがすべて自分のものであることを検証する。
	 */
	private async assertTagsOwned(tagIds: string[], userId: string): Promise<void> {
		const tags = await this.prisma.tag.findMany({
			where: {
				id: { in: tagIds },
				userId,
			},
		});

		if (tags.length !== tagIds.length) {
			throwForbidden(ERROR_CODES.AUTHZ.NOT_OWNER, 'Some tags do not belong to you');
		}
	}

	async assignTagsToMemo(memoId: string, assignTagsDto: AssignTagsDto, userId: string) {
		const memo = await this.prisma.memo.findUnique({ where: { id: memoId } });
		this.assertOwnedTaggable(memo, 'Memo', memoId, userId);
		await this.assertTagsOwned(assignTagsDto.tagIds, userId);

		// 既存のタグ関連を削除して新しい関連を作成
		await this.prisma.memoTag.deleteMany({ where: { memoId } });

		if (assignTagsDto.tagIds.length > 0) {
			await this.prisma.memoTag.createMany({
				data: assignTagsDto.tagIds.map((tagId) => ({ memoId, tagId })),
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
		const memo = await this.prisma.memo.findUnique({ where: { id: memoId } });
		this.assertOwnedTaggable(memo, 'Memo', memoId, userId);

		return this.prisma.memoTag.findMany({
			where: { memoId },
			include: {
				tag: true,
			},
		});
	}

	// ==== Notebooks x Tags (mirror of memos) ====
	async assignTagsToNotebook(notebookId: string, assignTagsDto: AssignTagsDto, userId: string) {
		const notebook = await this.prisma.notebook.findUnique({ where: { id: notebookId } });
		this.assertOwnedTaggable(notebook, 'Notebook', notebookId, userId);
		await this.assertTagsOwned(assignTagsDto.tagIds, userId);

		// 既存のタグ関連を削除して新しい関連を作成
		await this.prisma.notebookTag.deleteMany({ where: { notebookId } });

		if (assignTagsDto.tagIds.length > 0) {
			await this.prisma.notebookTag.createMany({
				data: assignTagsDto.tagIds.map((tagId) => ({ notebookId, tagId })),
			});
		}

		return this.prisma.notebook.findUnique({
			where: { id: notebookId },
			include: {
				notebookTags: {
					include: {
						tag: true,
					},
				},
			},
		});
	}

	async getNotebookTags(notebookId: string, userId: string) {
		const notebook = await this.prisma.notebook.findUnique({ where: { id: notebookId } });
		this.assertOwnedTaggable(notebook, 'Notebook', notebookId, userId);

		return this.prisma.notebookTag.findMany({
			where: { notebookId },
			include: { tag: true },
		});
	}
}

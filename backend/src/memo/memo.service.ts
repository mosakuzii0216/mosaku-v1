import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';
import { BaseOwnableService, PrismaModelDelegate } from '../common/services/base-ownable.service';
import { CreateMemoDto } from './dto/create-memo.dto';
import { UpdateMemoDto } from './dto/update-memo.dto';
import type { Memo, Prisma } from '@prisma/client';
import { NOTEBOOK_WITH_THEME_SELECT } from '../common/constants/prisma-selects';

// Memoエンティティ型（リレーション込み）
type MemoWithRelations = Memo & { userId: string };

@Injectable()
export class MemoService extends BaseOwnableService<MemoWithRelations> {
	constructor(
		prisma: PrismaService,
		authorizationService: AuthorizationService,
	) {
		super(prisma, authorizationService);
	}

	protected getModelDelegate(): PrismaModelDelegate<MemoWithRelations> {
		return this.prisma.memo as unknown as PrismaModelDelegate<MemoWithRelations>;
	}

	protected getEntityName(): string {
		return 'Memo';
	}

	protected getDefaultInclude() {
		return {
			memoTags: {
				include: {
					tag: true,
				},
			},
			notebook: {
				select: NOTEBOOK_WITH_THEME_SELECT,
			},
		};
	}

	protected getDefaultOrderBy() {
		return { updatedAt: 'desc' as const };
	}

	/**
	 * タグでフィルタリングして全メモを取得
	 */
	async findAll(userId: string, tagIds?: string[]) {
		if (!tagIds || tagIds.length === 0) {
			return super.findAll(userId);
		}

		const whereClause: Prisma.MemoWhereInput = {
			userId,
			memoTags: {
				some: {
					tagId: { in: tagIds },
				},
			},
		};

		return this.prisma.memo.findMany({
			where: whereClause,
			include: this.getDefaultInclude(),
			orderBy: this.getDefaultOrderBy(),
		});
	}

	async create(createMemoDto: CreateMemoDto, userId: string) {
		const createData: Prisma.MemoUncheckedCreateInput = {
			title: createMemoDto.title,
			content: createMemoDto.content,
			userId,
		};

		if (createMemoDto.notebookId) {
			createData.notebookId = createMemoDto.notebookId;
		}

		return this.prisma.memo.create({
			data: createData,
			include: {
				notebook: {
					select: NOTEBOOK_WITH_THEME_SELECT,
				},
			},
		});
	}

	async update(id: string, updateMemoDto: UpdateMemoDto, userId: string) {
		return this.updateBase(id, updateMemoDto, userId);
	}

	async search(query: string, userId: string, tagIds?: string[]) {
		if (!query) {
			return this.findAll(userId, tagIds);
		}

		const whereClause: Prisma.MemoWhereInput = {
			userId,
			OR: [
				{
					title: {
						contains: query,
						mode: 'insensitive',
					},
				},
				{
					content: {
						contains: query,
						mode: 'insensitive',
					},
				},
			],
		};

		// Filter by tags if provided
		if (tagIds && tagIds.length > 0) {
			whereClause.memoTags = {
				some: {
					tagId: { in: tagIds },
				},
			};
		}

		return this.prisma.memo.findMany({
			where: whereClause,
			include: {
				memoTags: {
					include: {
						tag: true,
					},
				},
				notebook: {
					select: NOTEBOOK_WITH_THEME_SELECT,
				},
			},
			orderBy: {
				updatedAt: 'desc',
			},
		});
	}
}

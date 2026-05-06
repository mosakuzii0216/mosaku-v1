import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';
import { BaseOwnableService, PrismaModelDelegate } from '../common/services/base-ownable.service';
import {
	PaginationQueryDto,
	PaginatedResult,
	createPaginatedResult,
	calculateSkip,
} from '../common/dto/pagination.dto';
import { CreateMemoDto } from './dto/create-memo.dto';
import { UpdateMemoDto } from './dto/update-memo.dto';
import type { Memo, Prisma } from '@prisma/client';
import { NOTEBOOK_WITH_THEME_SELECT } from '../common/constants/prisma-selects';

// Memoエンティティ型（リレーション込み）
type MemoWithRelations = Memo & { userId: string };

@Injectable()
export class MemoService extends BaseOwnableService<MemoWithRelations> {
	constructor(prisma: PrismaService, authorizationService: AuthorizationService) {
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
	 * IDで1件取得（所有者検証込み）
	 * ゴミ箱内メモは返さない（trashedAt: null のみ対象）
	 */
	async findOne(id: string, userId: string): Promise<MemoWithRelations> {
		const memo = await this.prisma.memo.findFirst({
			where: { id, trashedAt: null },
			include: this.getDefaultInclude(),
		});
		return this.authorizationService.validateOwnership(
			memo as MemoWithRelations | null,
			userId,
			this.getEntityName(),
		);
	}

	/**
	 * タグでフィルタリングして全メモを取得（ゴミ箱内メモを除外）
	 */
	async findAll(userId: string, tagIds?: string[]) {
		const whereClause: Prisma.MemoWhereInput = {
			userId,
			trashedAt: null,
		};

		if (tagIds && tagIds.length > 0) {
			whereClause.memoTags = {
				some: {
					tagId: { in: tagIds },
				},
			};
		}

		return this.prisma.memo.findMany({
			where: whereClause,
			include: this.getDefaultInclude(),
			orderBy: this.getDefaultOrderBy(),
		});
	}

	/**
	 * ページネーション付きでメモを取得（ゴミ箱内メモを除外）
	 */
	async findAllPaginated(
		userId: string,
		pagination: PaginationQueryDto,
		tagIds?: string[],
	): Promise<PaginatedResult<MemoWithRelations>> {
		const { page = 1, limit = 20 } = pagination;
		const skip = calculateSkip(page, limit);

		const whereClause: Prisma.MemoWhereInput = { userId, trashedAt: null };

		if (tagIds && tagIds.length > 0) {
			whereClause.memoTags = {
				some: {
					tagId: { in: tagIds },
				},
			};
		}

		const [data, total] = await Promise.all([
			this.prisma.memo.findMany({
				where: whereClause,
				include: this.getDefaultInclude(),
				orderBy: this.getDefaultOrderBy(),
				skip,
				take: limit,
			}),
			this.prisma.memo.count({ where: whereClause }),
		]);

		return createPaginatedResult(data as MemoWithRelations[], total, page, limit);
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
			trashedAt: null,
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

		if (tagIds && tagIds.length > 0) {
			whereClause.memoTags = {
				some: {
					tagId: { in: tagIds },
				},
			};
		}

		return this.prisma.memo.findMany({
			where: whereClause,
			include: this.getDefaultInclude(),
			orderBy: this.getDefaultOrderBy(),
		});
	}

	/**
	 * ページネーション付きで検索（ゴミ箱内メモを除外）
	 */
	async searchPaginated(
		query: string,
		userId: string,
		pagination: PaginationQueryDto,
		tagIds?: string[],
	): Promise<PaginatedResult<MemoWithRelations>> {
		if (!query) {
			return this.findAllPaginated(userId, pagination, tagIds);
		}

		const { page = 1, limit = 20 } = pagination;
		const skip = calculateSkip(page, limit);

		const whereClause: Prisma.MemoWhereInput = {
			userId,
			trashedAt: null,
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

		if (tagIds && tagIds.length > 0) {
			whereClause.memoTags = {
				some: {
					tagId: { in: tagIds },
				},
			};
		}

		const [data, total] = await Promise.all([
			this.prisma.memo.findMany({
				where: whereClause,
				include: this.getDefaultInclude(),
				orderBy: this.getDefaultOrderBy(),
				skip,
				take: limit,
			}),
			this.prisma.memo.count({ where: whereClause }),
		]);

		return createPaginatedResult(data as MemoWithRelations[], total, page, limit);
	}

	// ─── ゴミ箱操作メソッド ───────────────────────────────────────────

	/**
	 * メモをゴミ箱に移動する（Requirements: 1.1, 1.3）
	 */
	async trash(id: string, userId: string): Promise<MemoWithRelations> {
		await this.findOne(id, userId); // 所有者検証（ゴミ箱内メモはここで 404）
		return this.prisma.memo.update({
			where: { id },
			data: { trashedAt: new Date() },
			include: this.getDefaultInclude(),
		}) as unknown as MemoWithRelations;
	}

	/**
	 * ゴミ箱内メモを1件取得（所有者検証込み）
	 * restore / permanentDelete から呼び出す
	 */
	async findOneTrashed(id: string, userId: string): Promise<MemoWithRelations> {
		const memo = await this.prisma.memo.findFirst({
			where: { id, trashedAt: { not: null } },
			include: this.getDefaultInclude(),
		});
		return this.authorizationService.validateOwnership(
			memo as MemoWithRelations | null,
			userId,
			this.getEntityName(),
		);
	}

	/**
	 * ゴミ箱内メモ一覧を取得（Requirements: 2.1）
	 */
	async findTrashed(userId: string): Promise<MemoWithRelations[]> {
		const memos = await this.prisma.memo.findMany({
			where: { userId, trashedAt: { not: null } },
			include: this.getDefaultInclude(),
			orderBy: { trashedAt: 'desc' },
		});
		return memos as unknown as MemoWithRelations[];
	}

	/**
	 * ゴミ箱内メモを復元する（Requirements: 3.1, 3.2, 3.3）
	 */
	async restore(id: string, userId: string): Promise<MemoWithRelations> {
		await this.findOneTrashed(id, userId);
		return this.prisma.memo.update({
			where: { id },
			data: { trashedAt: null },
			include: this.getDefaultInclude(),
		}) as unknown as MemoWithRelations;
	}

	/**
	 * ゴミ箱内メモを完全削除する（Requirements: 4.1）
	 */
	async permanentDelete(id: string, userId: string): Promise<MemoWithRelations> {
		await this.findOneTrashed(id, userId);
		return this.prisma.memo.delete({
			where: { id },
		}) as unknown as MemoWithRelations;
	}

	/**
	 * ゴミ箱を空にする（Requirements: 4.2）
	 */
	async emptyTrash(userId: string): Promise<Prisma.BatchPayload> {
		return this.prisma.memo.deleteMany({
			where: { userId, trashedAt: { not: null } },
		});
	}
}

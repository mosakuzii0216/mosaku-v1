import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';
import { MemoSharingService } from './memo-sharing.service';
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
import { ERROR_CODES, throwConflict } from '../common/exceptions';
import { extractPlainText } from '../common/utils/prosemirror-text';

// Memoエンティティ型（リレーション込み）
type MemoWithRelations = Memo & { userId: string };

@Injectable()
export class MemoService extends BaseOwnableService<MemoWithRelations> {
	constructor(
		prisma: PrismaService,
		authorizationService: AuthorizationService,
		private readonly memoSharingService: MemoSharingService,
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

	protected getDefaultOrderBy(): Prisma.MemoOrderByWithRelationInput[] {
		// ピン留めを最優先。pinnedAt は NULL 許容で、Postgres の DESC は既定
		// NULLS FIRST のため、明示的に nulls: 'last' を指定していないと未ピンが先頭にくる。
		return [{ pinnedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' as const }];
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
		return this.authorizationService.validateOwnership(memo, userId, this.getEntityName());
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
		const contentText = extractPlainText(createMemoDto.content);
		const createData: Prisma.MemoUncheckedCreateInput = {
			title: createMemoDto.title,
			content: createMemoDto.content as unknown as Prisma.InputJsonValue,
			contentText,
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

	/**
	 * メモを更新する。
	 * - `clientUpdatedAt` 未指定時は従来挙動（無条件上書き）。
	 * - 指定時は last-write-wins 比較を行い、サーバーの `updatedAt` が新しい場合は
	 *   409 Conflict を投げて現在のメモを `details.current` に含める。
	 *   比較は UTC ミリ秒（`getTime()`）に正規化し、タイムゾーン差異を吸収する。
	 */
	async update(id: string, updateMemoDto: UpdateMemoDto, userId: string) {
		const { clientUpdatedAt, content, ...otherFields } = updateMemoDto;

		const patch: Record<string, unknown> = { ...otherFields };
		if (content !== undefined) {
			patch.content = content;
			patch.contentText = extractPlainText(content);
		}

		if (clientUpdatedAt === undefined) {
			return this.updateBase(id, patch, userId);
		}

		const existing = await this.findOne(id, userId);
		const serverMs = new Date(existing.updatedAt).getTime();
		const clientMs = new Date(clientUpdatedAt).getTime();

		if (serverMs > clientMs) {
			throwConflict(
				ERROR_CODES.RESOURCE.CONFLICT,
				'Memo has been updated on the server since clientUpdatedAt',
				{ current: existing },
			);
		}

		return (await this.prisma.memo.update({
			where: { id },
			data: patch,
			include: this.getDefaultInclude(),
		})) as unknown as MemoWithRelations;
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
					contentText: {
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
					contentText: {
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
	 * 公開中のメモは自動的に非公開化する（cascade-trash）
	 */
	async trash(id: string, userId: string): Promise<MemoWithRelations> {
		await this.findOne(id, userId); // 所有者検証（ゴミ箱内メモはここで 404）
		await this.memoSharingService.unpublishIfPublished(id, userId);
		return this.prisma.memo.update({
			where: { id },
			data: { trashedAt: new Date() },
			include: this.getDefaultInclude(),
		});
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
		return this.authorizationService.validateOwnership(memo, userId, this.getEntityName());
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
		return memos;
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
		});
	}

	/**
	 * ゴミ箱内メモを完全削除する（Requirements: 4.1）
	 */
	async permanentDelete(id: string, userId: string): Promise<MemoWithRelations> {
		await this.findOneTrashed(id, userId);
		return this.prisma.memo.delete({
			where: { id },
		});
	}

	/**
	 * ゴミ箱を空にする（Requirements: 4.2）
	 */
	async emptyTrash(userId: string): Promise<Prisma.BatchPayload> {
		return this.prisma.memo.deleteMany({
			where: { userId, trashedAt: { not: null } },
		});
	}

	// ─── ピン留め ─────────────────────────────────

	/**
	 * メモをピン留めする(一覧の先頭に固定)
	 */

	async pin(id: string, userId: string): Promise<MemoWithRelations> {
		await this.findOne(id, userId); // 所有者検証（ゴミ箱ないメモはここで404）
		return this.prisma.memo.update({
			where: { id },
			data: { pinnedAt: new Date() },
			include: this.getDefaultInclude(),
		});
	}

	/**
	 * メモのピン留めを解除する
	 */
	async unpin(id: string, userId: string): Promise<MemoWithRelations> {
		await this.findOne(id, userId);
		return this.prisma.memo.update({
			where: { id },
			data: { pinnedAt: null },
			include: this.getDefaultInclude(),
		});
	}
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';
import { CreateMemoDto } from './dto/create-memo.dto';
import { UpdateMemoDto } from './dto/update-memo.dto';
import type { Prisma } from '@prisma/client';

@Injectable()
export class MemoService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly authorizationService: AuthorizationService,
	) {}

	async findAll(userId: string, tagIds?: string[]) {
		const whereClause: Prisma.MemoWhereInput = { userId };

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
				theme: {
					select: {
						id: true,
						name: true,
						styles: true,
						cssFilePath: true,
					},
				},
				notebook: {
					select: { id: true, name: true },
				},
			},
			orderBy: {
				updatedAt: 'desc',
			},
		});
	}

	async findOne(id: string, userId: string) {
		const memo = await this.prisma.memo.findUnique({
			where: { id },
			include: {
				memoTags: {
					include: {
						tag: true,
					},
				},
				theme: {
					select: {
						id: true,
						name: true,
						styles: true,
						cssFilePath: true,
					},
				},
				notebook: {
					select: { id: true, name: true },
				},
			},
		});

		return this.authorizationService.validateOwnership(memo, userId, 'Memo');
	}

	async create(createMemoDto: CreateMemoDto, userId: string) {
		const createData: Prisma.MemoUncheckedCreateInput = {
			title: createMemoDto.title,
			content: createMemoDto.content,
			userId,
		};

		// テーマIDが指定されている場合は関連付け
		if (createMemoDto.themeId) {
			createData.themeId = createMemoDto.themeId;
		}

		if (createMemoDto.notebookId) {
			createData.notebookId = createMemoDto.notebookId;
		}

		return this.prisma.memo.create({
			data: createData,
			include: {
				theme: {
					select: {
						id: true,
						name: true,
						styles: true,
						cssFilePath: true,
					},
				},
				notebook: {
					select: { id: true, name: true },
				},
			},
		});
	}

	async update(id: string, updateMemoDto: UpdateMemoDto, userId: string) {
		const memo = await this.prisma.memo.findUnique({
			where: { id },
		});

		this.authorizationService.validateOwnership(memo, userId, 'Memo');

		return this.prisma.memo.update({
			where: { id },
			data: updateMemoDto,
			include: {
				theme: {
					select: {
						id: true,
						name: true,
						styles: true,
						cssFilePath: true,
					},
				},
				notebook: {
					select: { id: true, name: true },
				},
			},
		});
	}

	async remove(id: string, userId: string) {
		const memo = await this.prisma.memo.findUnique({
			where: { id },
		});

		this.authorizationService.validateOwnership(memo, userId, 'Memo');

		return this.prisma.memo.delete({
			where: { id },
		});
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
				theme: {
					select: {
						id: true,
						name: true,
						styles: true,
						cssFilePath: true,
					},
				},
			},
			orderBy: {
				updatedAt: 'desc',
			},
		});
	}
}

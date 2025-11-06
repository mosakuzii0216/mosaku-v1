import { Injectable } from '@nestjs/common';
import { AuthorizationService } from 'src/common/services/authorization.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateNotebookDto } from './dto/create-notebook.dto/create-notebook.dto';
import { UpdateNotebookDto } from './dto/update-notebook.dto/update-notebook.dto';
import type { Prisma } from '@prisma/client';

@Injectable()
export class NotebookService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly authorizationService: AuthorizationService,
	) {}

	findAll(userId: string) {
		return this.prisma.notebook.findMany({
			where: { userId },
			include: {
				theme: { select: { id: true, name: true, styles: true } },
			},
			orderBy: { updatedAt: 'desc' },
		});
	}

	// 1件取得(所有者チェック込み)
	async findOne(id: string, userId: string) {
		const notebook = await this.prisma.notebook.findUnique({
			where: { id },
			include: {
				theme: { select: { id: true, name: true, styles: true } },
			},
		});
		// 見つからない/他人のものなら例外に
		return this.authorizationService.validateOwnership(notebook, userId, 'Notebook');
	}

	// 作成
	create(dto: CreateNotebookDto, userId: string) {
		const data: Prisma.NotebookCreateInput = {
			name: dto.name ?? null,
			user: { connect: { id: userId } },
			...(dto.themeId ? { theme: { connect: { id: dto.themeId } } } : {}),
			...(dto.content !== undefined ? { content: dto.content } : {}),
		};
		return this.prisma.notebook.create({
			data,
			include: {
				theme: { select: { id: true, name: true, styles: true } },
			},
		});
		// メモ: Notebookにcontent等を足すならschema.prismaを変更 → migrationしてここでdataに加える
	}

	// 更新(まず所有者チェック→更新)
	async update(id: string, dto: UpdateNotebookDto, userId: string) {
		const existing = await this.prisma.notebook.findUnique({ where: { id } });
		this.authorizationService.validateOwnership(existing, userId, 'Notebook');

		const data: Prisma.NotebookUpdateInput = {
			...(dto.name !== undefined ? { name: dto.name } : {}),
			...(dto.themeId
				? { theme: { connect: { id: dto.themeId } } }
				: { theme: { disconnect: true } }),
			...(dto.content !== undefined ? { content: dto.content } : {}),
		};
		return this.prisma.notebook.update({
			where: { id },
			data,
			include: {
				theme: { select: { id: true, name: true, styles: true } },
			},
		});
	}

	async delete(id: string, userId: string) {
		const existing = await this.prisma.notebook.findUnique({ where: { id } });
		this.authorizationService.validateOwnership(existing, userId, 'Notebook');

		return this.prisma.notebook.delete({ where: { id } });
	}
}

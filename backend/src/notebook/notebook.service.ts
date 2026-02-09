import { Injectable } from '@nestjs/common';
import { AuthorizationService } from 'src/common/services/authorization.service';
import { BaseOwnableService, PrismaModelDelegate } from 'src/common/services/base-ownable.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateNotebookDto } from './dto/create-notebook.dto';
import { UpdateNotebookDto } from './dto/update-notebook.dto';
import type { Notebook, Prisma } from '@prisma/client';
import { THEME_SELECT } from '../common/constants/prisma-selects';

type NotebookWithRelations = Notebook & { userId: string };

@Injectable()
export class NotebookService extends BaseOwnableService<NotebookWithRelations> {
	constructor(prisma: PrismaService, authorizationService: AuthorizationService) {
		super(prisma, authorizationService);
	}

	protected getModelDelegate(): PrismaModelDelegate<NotebookWithRelations> {
		return this.prisma.notebook as unknown as PrismaModelDelegate<NotebookWithRelations>;
	}

	protected getEntityName(): string {
		return 'Notebook';
	}

	protected getDefaultInclude() {
		return {
			theme: { select: THEME_SELECT },
		};
	}

	protected getDefaultOrderBy() {
		return { updatedAt: 'desc' as const };
	}

	create(dto: CreateNotebookDto, userId: string) {
		const data: Prisma.NotebookCreateInput = {
			name: dto.name ?? null,
			user: { connect: { id: userId } },
			...(dto.themeId ? { theme: { connect: { id: dto.themeId } } } : {}),
			...(dto.content !== undefined ? { content: dto.content } : {}),
		};
		return this.prisma.notebook.create({
			data,
			include: this.getDefaultInclude(),
		});
	}

	async update(id: string, dto: UpdateNotebookDto, userId: string) {
		// 所有者検証
		await this.findOne(id, userId);

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
			include: this.getDefaultInclude(),
		});
	}

	async delete(id: string, userId: string) {
		return this.remove(id, userId);
	}
}

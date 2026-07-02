import { Injectable } from '@nestjs/common';
import { AuthorizationService } from 'src/common/services/authorization.service';
import { BaseOwnableService, PrismaModelDelegate } from 'src/common/services/base-ownable.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateNotebookDto } from './dto/create-notebook.dto';
import { UpdateNotebookDto } from './dto/update-notebook.dto';
import { Prisma, type Notebook } from '@prisma/client';
import { THEME_SELECT } from '../common/constants/prisma-selects';
import { extractPlainText } from '../common/utils/prosemirror-text';

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
		const contentFields =
			dto.content !== undefined
				? {
						content:
							dto.content !== null
								? (dto.content as unknown as Prisma.InputJsonValue)
								: Prisma.DbNull,
						contentText: dto.content !== null ? extractPlainText(dto.content) : null,
					}
				: {};

		const data: Prisma.NotebookCreateInput = {
			name: dto.name ?? null,
			user: { connect: { id: userId } },
			...(dto.themeId ? { theme: { connect: { id: dto.themeId } } } : {}),
			...contentFields,
		};
		return this.prisma.notebook.create({
			data,
			include: this.getDefaultInclude(),
		});
	}

	async update(id: string, dto: UpdateNotebookDto, userId: string) {
		await this.findOne(id, userId);

		const contentFields =
			dto.content !== undefined
				? {
						content:
							dto.content !== null
								? (dto.content as unknown as Prisma.InputJsonValue)
								: Prisma.DbNull,
						contentText: dto.content !== null ? extractPlainText(dto.content) : null,
					}
				: {};

		const data: Prisma.NotebookUpdateInput = {
			...(dto.name !== undefined ? { name: dto.name } : {}),
			...(dto.themeId
				? { theme: { connect: { id: dto.themeId } } }
				: { theme: { disconnect: true } }),
			...contentFields,
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

import {
	Injectable,
	NotFoundException,
	ForbiddenException,
	BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';
import type { Prisma, Theme } from '@prisma/client';
import { CreateThemeDto } from './dto/create-theme.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { SearchThemeDto } from './dto/search-theme.dto';

@Injectable()
export class ThemeService {
	constructor(
		private prisma: PrismaService,
		private readonly authorizationService: AuthorizationService,
	) {}

	/**
	 * テーマの編集権限を検証（システムテーマと所有者チェック）
	 */
	private validateThemeOwnership(theme: Theme | null, userId: string, action: string): void {
		const ensuredTheme = this.authorizationService.validateExistence(theme, 'テーマ');

		if (ensuredTheme.isSystem || ensuredTheme.createdById !== userId) {
			throw new ForbiddenException(`このテーマを${action}する権限がありません`);
		}
	}

	/**
	 * テーマ一覧を取得（検索・フィルタリング対応）
	 */
	async findMany(searchDto: SearchThemeDto, userId?: string) {
		const { query, category, isSystem, isPublic, favoritesOnly } = searchDto;

		// 基本検索条件
		const where: Prisma.ThemeWhereInput = {};

		// テキスト検索
		if (query) {
			where.OR = [
				{ name: { contains: query, mode: 'insensitive' } },
				{ description: { contains: query, mode: 'insensitive' } },
			];
		}

		// システムテーマフィルター
		if (isSystem !== undefined) {
			where.isSystem = isSystem;
		}

		// カテゴリフィルター
		if (category) {
			where.category = {
				is: {
					OR: [{ slug: category }, { name: category }],
				},
			};
		}

		// 公開テーマフィルター
		if (isPublic !== undefined) {
			where.isPublic = isPublic;
		}

		// お気に入りフィルター（ログイン時のみ）
		if (favoritesOnly && userId) {
			where.userFavorites = {
				some: {
					userId: userId,
				},
			};
		}

		// アクセス権限の条件追加
		if (!userId) {
			// 未ログイン：システムテーマまたは公開テーマのみ
			where.OR = [{ isSystem: true }, { isPublic: true }];
		} else {
			// ログイン済み：システム、公開、または自分が作成したテーマ
			if (!where.OR) {
				where.OR = [];
			}
			where.OR.push({ isSystem: true }, { isPublic: true }, { createdById: userId });
		}

		const themes = await this.prisma.theme.findMany({
			where,
			include: {
				createdBy: {
					select: { id: true, name: true },
				},
				userFavorites: userId
					? {
							where: { userId },
							select: { userId: true },
						}
					: false,
				_count: {
					select: {
						userFavorites: true,
						notebooks: true,
					},
				},
			},
			orderBy: [
				{ isSystem: 'desc' }, // システムテーマを先頭に
				{ createdAt: 'desc' },
			],
		});

		// レスポンス形式を整形
		return themes.map((theme) => ({
			...theme,
			isFavorited: userId && theme.userFavorites?.length > 0,
			favoriteCount: theme._count.userFavorites,
			usageCount: theme._count.notebooks,
			userFavorites: undefined, // クライアントには送らない
			_count: undefined,
		}));
	}

	/**
	 * テーマをIDで取得
	 */
	async findOne(id: string, userId?: string) {
		const theme = await this.prisma.theme.findUnique({
			where: { id },
			include: {
				createdBy: {
					select: { id: true, name: true },
				},
				userFavorites: userId
					? {
							where: { userId },
							select: { userId: true },
						}
					: false,
				_count: {
					select: {
						userFavorites: true,
						notebooks: true,
					},
				},
			},
		});

		if (!theme) {
			throw new NotFoundException('テーマが見つかりません');
		}

		// アクセス権限チェック
		const hasAccess = theme.isSystem || theme.isPublic || (userId && theme.createdById === userId);

		if (!hasAccess) {
			throw new ForbiddenException('このテーマにアクセスする権限がありません');
		}

		return {
			...theme,
			isFavorited: userId && theme.userFavorites?.length > 0,
			favoriteCount: theme._count.userFavorites,
			usageCount: theme._count.notebooks,
			userFavorites: undefined,
			_count: undefined,
		};
	}

	/**
	 * 新しいテーマを作成
	 */
	async create(createThemeDto: CreateThemeDto, userId: string) {
		// CSS file path または styles のどちらかが必要
		if (
			!createThemeDto.cssFilePath &&
			(!createThemeDto.styles || typeof createThemeDto.styles !== 'object')
		) {
			throw new BadRequestException('CSSファイルパスまたは有効なスタイルデータが必要です');
		}

		// stylesがある場合は必須フィールドの検証
		if (createThemeDto.styles) {
			const requiredFields = ['colors', 'typography', 'layout'];
			for (const field of requiredFields) {
				if (!createThemeDto.styles[field]) {
					throw new BadRequestException(`スタイル設定に${field}が含まれている必要があります`);
				}
			}
		}

		const theme = await this.prisma.theme.create({
			data: {
				name: createThemeDto.name,
				description: createThemeDto.description,
				isSystem: false, // ユーザー作成テーマ
				isPublic: createThemeDto.isPublic || false,
				styles: createThemeDto.styles || null,
				cssFilePath: createThemeDto.cssFilePath || null,
				metadata: createThemeDto.metadata || {},
				createdById: userId,
			},
			include: {
				createdBy: {
					select: { id: true, name: true },
				},
			},
		});

		return theme;
	}

	/**
	 * テーマを更新
	 */
	async update(id: string, updateThemeDto: UpdateThemeDto, userId: string) {
		const theme = await this.prisma.theme.findUnique({
			where: { id },
		});

		this.validateThemeOwnership(theme, userId, '更新');

		// スタイルデータの検証（更新時）
		if (updateThemeDto.styles) {
			if (typeof updateThemeDto.styles !== 'object') {
				throw new BadRequestException('有効なスタイルデータが必要です');
			}
		}

		const updatedTheme = await this.prisma.theme.update({
			where: { id },
			data: {
				...(updateThemeDto.name && { name: updateThemeDto.name }),
				...(updateThemeDto.description !== undefined && {
					description: updateThemeDto.description,
				}),
				...(updateThemeDto.isPublic !== undefined && {
					isPublic: updateThemeDto.isPublic,
				}),
				...(updateThemeDto.styles && { styles: updateThemeDto.styles }),
				...(updateThemeDto.cssFilePath && { cssFilePath: updateThemeDto.cssFilePath }),
				...(updateThemeDto.metadata && { metadata: updateThemeDto.metadata }),
			},
			include: {
				createdBy: {
					select: { id: true, name: true },
				},
			},
		});

		return updatedTheme;
	}

	/**
	 * テーマを削除
	 */
	async remove(id: string, userId: string) {
		const theme = await this.prisma.theme.findUnique({
			where: { id },
			include: {
				_count: {
					select: { notebooks: true },
				},
			},
		});

		this.validateThemeOwnership(theme, userId, '削除');

		// 使用中のテーマは削除不可
		if (theme!._count.notebooks > 0) {
			throw new BadRequestException('使用中のテーマは削除できません');
		}

		await this.prisma.theme.delete({
			where: { id },
		});

		return { message: 'テーマを削除しました' };
	}

	/**
	 * テーマをお気に入りに追加
	 */
	async addToFavorites(themeId: string, userId: string) {
		// テーマの存在確認
		const theme = await this.prisma.theme.findUnique({
			where: { id: themeId },
		});

		if (!theme) {
			throw new NotFoundException('テーマが見つかりません');
		}

		// アクセス権限チェック
		const hasAccess = theme.isSystem || theme.isPublic || theme.createdById === userId;

		if (!hasAccess) {
			throw new ForbiddenException('このテーマにアクセスする権限がありません');
		}

		// 既にお気に入りかチェック
		const existingFavorite = await this.prisma.userFavoriteTheme.findUnique({
			where: {
				userId_themeId: {
					userId,
					themeId,
				},
			},
		});

		if (existingFavorite) {
			throw new BadRequestException('既にお気に入りに追加されています');
		}

		await this.prisma.userFavoriteTheme.create({
			data: {
				userId,
				themeId,
			},
		});

		return { message: 'お気に入りに追加しました' };
	}

	/**
	 * テーマをお気に入りから削除
	 */
	async removeFromFavorites(themeId: string, userId: string) {
		const existingFavorite = await this.prisma.userFavoriteTheme.findUnique({
			where: {
				userId_themeId: {
					userId,
					themeId,
				},
			},
		});

		if (!existingFavorite) {
			throw new NotFoundException('お気に入りに登録されていません');
		}

		await this.prisma.userFavoriteTheme.delete({
			where: {
				userId_themeId: {
					userId,
					themeId,
				},
			},
		});

		return { message: 'お気に入りから削除しました' };
	}

	/**
	 * ユーザーのお気に入りテーマ一覧を取得
	 */
	async getUserFavorites(userId: string) {
		const favorites = await this.prisma.userFavoriteTheme.findMany({
			where: { userId },
			include: {
				theme: {
					include: {
						createdBy: {
							select: { id: true, name: true },
						},
						_count: {
							select: {
								userFavorites: true,
								notebooks: true,
							},
						},
					},
				},
			},
			orderBy: {
				theme: {
					name: 'asc',
				},
			},
		});

		return favorites.map((fav) => ({
			...fav.theme,
			isFavorited: true,
			favoriteCount: fav.theme._count.userFavorites,
			usageCount: fav.theme._count.notebooks,
			_count: undefined,
		}));
	}
}

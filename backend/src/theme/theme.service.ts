import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';
import { ERROR_CODES, throwBadRequest, throwForbidden, throwNotFound } from '../common/exceptions';
import type { Prisma, themes } from '@prisma/client';
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
	private validateThemeOwnership(theme: themes | null, userId: string, action: string): void {
		const ensuredTheme = this.authorizationService.validateExistence(theme, 'テーマ');

		if (ensuredTheme.isSystem || ensuredTheme.createdById !== userId) {
			throwForbidden(ERROR_CODES.AUTHZ.NO_PERMISSION, `このテーマを${action}する権限がありません`);
		}
	}

	/**
	 * テーマへのアクセス権限を確認
	 * システムテーマ、公開テーマ、または自分が作成したテーマにアクセス可能
	 */
	private canAccessTheme(theme: Theme, userId?: string): boolean {
		return theme.isSystem || theme.isPublic || (!!userId && theme.createdById === userId);
	}

	/**
	 * テーマへのアクセス権限を検証（権限がない場合は例外をスロー）
	 */
	private assertCanAccessTheme(theme: Theme, userId?: string): void {
		if (!this.canAccessTheme(theme, userId)) {
			throwForbidden(ERROR_CODES.AUTHZ.NO_PERMISSION, 'このテーマにアクセスする権限がありません');
		}
	}

	/**
	 * テーマ一覧を取得（検索・フィルタリング対応）
	 */
	async findMany(searchDto: SearchThemeDto, userId?: string) {
		const whereClause = this.buildWhereClause(searchDto, userId);

		const themes = await this.prisma.theme.findMany({
			where: whereClause,
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

		return this.transformThemes(themes, userId);
	}

	private buildWhereClause(searchDto: SearchThemeDto, userId?: string): Prisma.ThemeWhereInput {
		const { query, category, isSystem, isPublic, favoritesOnly } = searchDto;
		const conditions: Prisma.ThemeWhereInput[] = [];

		// アクセス権限の条件
		const accessConditions: Prisma.ThemeWhereInput[] = [{ isSystem: true }, { isPublic: true }];
		if (userId) {
			accessConditions.push({ createdById: userId });
		}
		conditions.push({ OR: accessConditions });

		// テキスト検索
		if (query) {
			conditions.push({
				OR: [
					{ name: { contains: query, mode: 'insensitive' } },
					{ description: { contains: query, mode: 'insensitive' } },
				],
			});
		}

		// システムテーマフィルター
		if (isSystem !== undefined) {
			conditions.push({ isSystem });
		}

		// カテゴリフィルター
		if (category) {
			conditions.push({
				category: {
					is: {
						OR: [{ slug: category }, { name: category }],
					},
				},
			});
		}

		// 公開テーマフィルター
		if (isPublic !== undefined) {
			conditions.push({ isPublic });
		}

		// お気に入りフィルター（ログイン時のみ）
		if (favoritesOnly && userId) {
			conditions.push({
				userFavorites: {
					some: { userId },
				},
			});
		}

		return { AND: conditions };
	}

	private transformThemes(
		themeList: Array<
			themes & {
				userFavorites?: Array<{ userId: string }>;
				_count?: { userFavorites: number; notebooks: number };
			}
		>,
		userId?: string,
	) {
		return themeList.map((theme) => ({
			...theme,
			isFavorited: userId && (theme.userFavorites?.length ?? 0) > 0,
			favoriteCount: theme._count?.userFavorites ?? 0,
			usageCount: theme._count?.notebooks ?? 0,
			userFavorites: undefined,
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
			throwNotFound(ERROR_CODES.RESOURCE.NOT_FOUND, 'テーマが見つかりません');
		}

		// アクセス権限チェック
		this.assertCanAccessTheme(theme, userId);

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
			throwBadRequest(ERROR_CODES.VALIDATION.MISSING_CSS_OR_STYLES);
		}

		// stylesがある場合は必須フィールドの検証
		if (createThemeDto.styles) {
			const requiredFields = ['colors', 'typography', 'layout'];
			for (const field of requiredFields) {
				if (!createThemeDto.styles[field]) {
					throwBadRequest(
						ERROR_CODES.VALIDATION.MISSING_REQUIRED_STYLE_FIELD,
						`スタイル設定に${field}が含まれている必要があります`,
					);
				}
			}
		}

		const theme = await this.prisma.theme.create({
			data: {
				name: createThemeDto.name,
				description: createThemeDto.description,
				isSystem: false, // ユーザー作成テーマ
				isPublic: createThemeDto.isPublic || false,
				styles: (createThemeDto.styles as any) || null,
				cssFilePath: createThemeDto.cssFilePath || null,
				metadata: (createThemeDto.metadata as any) || {},
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
				throwBadRequest(ERROR_CODES.VALIDATION.INVALID_INPUT, '有効なスタイルデータが必要です');
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
				...(updateThemeDto.styles && { styles: updateThemeDto.styles as any }),
				...(updateThemeDto.cssFilePath && { cssFilePath: updateThemeDto.cssFilePath }),
				...(updateThemeDto.metadata && { metadata: updateThemeDto.metadata as any }),
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
			throwBadRequest(ERROR_CODES.RESOURCE.IN_USE);
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
			throwNotFound(ERROR_CODES.RESOURCE.NOT_FOUND, 'テーマが見つかりません');
		}

		// アクセス権限チェック
		this.assertCanAccessTheme(theme, userId);

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
			throwBadRequest(ERROR_CODES.RESOURCE.ALREADY_FAVORITED);
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
			throwNotFound(ERROR_CODES.RESOURCE.NOT_FAVORITED);
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

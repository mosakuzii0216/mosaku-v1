import {
	Controller,
	Get,
	Post,
	Put,
	Delete,
	Body,
	Param,
	Query,
	UseGuards,
	Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { ThemeService } from './theme.service';
import { CreateThemeDto } from './dto/create-theme.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { SearchThemeDto } from './dto/search-theme.dto';
import { FavoriteThemeDto } from './dto/favorite-theme.dto';
import type { AuthenticatedRequest, MaybeAuthRequest } from '../auth/types';

@Controller('theme')
export class ThemeController {
	constructor(private readonly themeService: ThemeService) {}

	/**
	 * テーマ一覧を取得
	 * GET /theme
	 */
	@Public()
	@Get()
	async findAll(@Query() searchDto: SearchThemeDto, @Request() req: MaybeAuthRequest) {
		const userId = req.user?.id;
		return this.themeService.findMany(searchDto, userId);
	}

	/**
	 * 特定のテーマを取得
	 * GET /theme/:id
	 */
	@Public()
	@Get(':id')
	async findOne(@Param('id') id: string, @Request() req: MaybeAuthRequest) {
		const userId = req.user?.id;
		return this.themeService.findOne(id, userId);
	}

	/**
	 * 新しいテーマを作成（認証必須）
	 * POST /theme
	 */
	@Post()
	@UseGuards(JwtAuthGuard)
	async create(@Body() createThemeDto: CreateThemeDto, @Request() req: AuthenticatedRequest) {
		const userId = req.user.id; // 認証されたユーザーID
		return this.themeService.create(createThemeDto, userId);
	}

	/**
	 * テーマを更新（認証必須・作成者のみ）
	 * PUT /theme/:id
	 */
	@Put(':id')
	@UseGuards(JwtAuthGuard)
	async update(
		@Param('id') id: string,
		@Body() updateThemeDto: UpdateThemeDto,
		@Request() req: AuthenticatedRequest,
	) {
		const userId = req.user.id;
		return this.themeService.update(id, updateThemeDto, userId);
	}

	/**
	 * テーマを削除（認証必須・作成者のみ）
	 * DELETE /theme/:id
	 */
	@Delete(':id')
	@UseGuards(JwtAuthGuard)
	async remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		const userId = req.user.id;
		return this.themeService.remove(id, userId);
	}

	/**
	 * テーマをお気に入りに追加（認証必須）
	 * POST /theme/:id/favorite
	 */
	@Post(':id/favorite')
	@UseGuards(JwtAuthGuard)
	async addToFavorites(@Param('id') themeId: string, @Request() req: AuthenticatedRequest) {
		const userId = req.user.id;
		return this.themeService.addToFavorites(themeId, userId);
	}

	/**
	 * テーマをお気に入りから削除（認証必須）
	 * DELETE /theme/:id/favorite
	 */
	@Delete(':id/favorite')
	@UseGuards(JwtAuthGuard)
	async removeFromFavorites(@Param('id') themeId: string, @Request() req: AuthenticatedRequest) {
		const userId = req.user.id;
		return this.themeService.removeFromFavorites(themeId, userId);
	}

	/**
	 * ユーザーのお気に入りテーマ一覧を取得（認証必須）
	 * GET /theme/favorites/me
	 */
	@Get('favorites/me')
	@UseGuards(JwtAuthGuard)
	async getUserFavorites(@Request() req: AuthenticatedRequest) {
		const userId = req.user.id;
		return this.themeService.getUserFavorites(userId);
	}

	/**
	 * システムテーマ一覧を取得（認証不要）
	 * GET /theme/system/list
	 */
	@Public()
	@Get('system/list')
	async getSystemThemes(@Request() req: MaybeAuthRequest) {
		const userId = req.user?.id;
		const searchDto: SearchThemeDto = { isSystem: true };
		return this.themeService.findMany(searchDto, userId);
	}

	/**
	 * 公開テーマ一覧を取得（認証不要）
	 * GET /theme/public/list
	 */
	@Public()
	@Get('public/list')
	async getPublicThemes(@Request() req: MaybeAuthRequest) {
		const userId = req.user?.id;
		const searchDto: SearchThemeDto = { isPublic: true };
		return this.themeService.findMany(searchDto, userId);
	}

	/**
	 * カテゴリ別テーマ一覧を取得
	 * GET /theme/category/:category
	 */
	@Public()
	@Get('category/:category')
	async getThemesByCategory(@Param('category') category: string, @Request() req: MaybeAuthRequest) {
		const userId = req.user?.id;
		const searchDto: SearchThemeDto = { category };
		return this.themeService.findMany(searchDto, userId);
	}
}

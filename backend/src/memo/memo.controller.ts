import {
	Controller,
	Get,
	Post,
	Body,
	Patch,
	Param,
	Delete,
	Query,
	UseGuards,
	Request,
} from '@nestjs/common';
import { MemoService } from './memo.service';
import { CreateMemoDto } from './dto/create-memo.dto';
import { UpdateMemoDto } from './dto/update-memo.dto';
import { SearchMemoDto } from './dto/search-memo.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types';

@Controller('memos')
@UseGuards(JwtAuthGuard)
export class MemoController {
	constructor(private readonly memoService: MemoService) {}

	@Post()
	create(@Body() createMemoDto: CreateMemoDto, @Request() req: AuthenticatedRequest) {
		return this.memoService.create(createMemoDto, req.user.id);
	}

	/**
	 * メモ一覧取得（後方互換性のため全件返却）
	 */
	@Get()
	findAll(@Query('tagIds') tagIds: string | string[], @Request() req: AuthenticatedRequest) {
		const tagIdArray = Array.isArray(tagIds) ? tagIds : tagIds ? [tagIds] : undefined;
		return this.memoService.findAll(req.user.id, tagIdArray);
	}

	/**
	 * メモ一覧取得（ページネーション対応）
	 * GET /memos/paginated?page=1&limit=20&tagIds=xxx
	 */
	@Get('paginated')
	findAllPaginated(
		@Query() pagination: PaginationQueryDto,
		@Query('tagIds') tagIds: string | string[],
		@Request() req: AuthenticatedRequest,
	) {
		const tagIdArray = Array.isArray(tagIds) ? tagIds : tagIds ? [tagIds] : undefined;
		return this.memoService.findAllPaginated(req.user.id, pagination, tagIdArray);
	}

	/**
	 * メモ検索（後方互換性のため全件返却）
	 */
	@Get('search')
	search(
		@Query() searchMemoDto: SearchMemoDto,
		@Query('tagIds') tagIds: string | string[],
		@Request() req: AuthenticatedRequest,
	) {
		const tagIdArray = Array.isArray(tagIds) ? tagIds : tagIds ? [tagIds] : undefined;
		return this.memoService.search(searchMemoDto.q || '', req.user.id, tagIdArray);
	}

	/**
	 * メモ検索（ページネーション対応）
	 * GET /memos/search/paginated?q=xxx&page=1&limit=20&tagIds=xxx
	 */
	@Get('search/paginated')
	searchPaginated(
		@Query() searchMemoDto: SearchMemoDto,
		@Query() pagination: PaginationQueryDto,
		@Query('tagIds') tagIds: string | string[],
		@Request() req: AuthenticatedRequest,
	) {
		const tagIdArray = Array.isArray(tagIds) ? tagIds : tagIds ? [tagIds] : undefined;
		return this.memoService.searchPaginated(
			searchMemoDto.q || '',
			req.user.id,
			pagination,
			tagIdArray,
		);
	}

	/**
	 * ゴミ箱内メモ一覧取得
	 * GET /memos/trash（:id と衝突しないよう先に定義）
	 */
	@Get('trash')
	findTrashed(@Request() req: AuthenticatedRequest) {
		return this.memoService.findTrashed(req.user.id);
	}

	/**
	 * ゴミ箱を空にする
	 * DELETE /memos/trash（:id と衝突しないよう先に定義）
	 */
	@Delete('trash')
	async emptyTrash(@Request() req: AuthenticatedRequest) {
		const result = await this.memoService.emptyTrash(req.user.id);
		return { count: result.count };
	}

	@Get(':id')
	findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		return this.memoService.findOne(id, req.user.id);
	}

	@Patch(':id')
	update(
		@Param('id') id: string,
		@Body() updateMemoDto: UpdateMemoDto,
		@Request() req: AuthenticatedRequest,
	) {
		return this.memoService.update(id, updateMemoDto, req.user.id);
	}

	/**
	 * メモをゴミ箱に移動（soft delete）
	 * DELETE /memos/:id
	 */
	@Delete(':id')
	remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		return this.memoService.trash(id, req.user.id);
	}

	/**
	 * ゴミ箱内メモを復元する
	 * PATCH /memos/:id/restore
	 */
	@Patch(':id/restore')
	restore(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		return this.memoService.restore(id, req.user.id);
	}

	/**
	 * ゴミ箱内メモを完全削除する
	 * DELETE /memos/:id/permanent
	 */
	@Delete(':id/permanent')
	permanentDelete(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		return this.memoService.permanentDelete(id, req.user.id);
	}
}

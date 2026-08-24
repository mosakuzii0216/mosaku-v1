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
	UseInterceptors,
	Request,
} from '@nestjs/common';
import { MemoService } from './memo.service';
import { MemoSharingService } from './memo-sharing.service';
import { MemoEditObservabilityInterceptor } from './memo-edit-observability.interceptor';
import { CreateMemoDto } from './dto/create-memo.dto';
import { UpdateMemoDto } from './dto/update-memo.dto';
import { SearchMemoDto } from './dto/search-memo.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types';

@Controller('memos')
@UseGuards(JwtAuthGuard)
@UseInterceptors(MemoEditObservabilityInterceptor)
export class MemoController {
	constructor(
		private readonly memoService: MemoService,
		private readonly memoSharingService: MemoSharingService,
	) {}

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

	/**
	 * 自分の公開中メモ一覧を取得する
	 * GET /memos/me/public-memos（:id と衝突しないよう先に定義）
	 */
	@Get('me/public-memos')
	listMyPublicMemos(@Request() req: AuthenticatedRequest) {
		return this.memoSharingService.listMyPublicMemos(req.user.id);
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
	 * メモをピン留めする
	 * PATCH /memos/:id/pin
	 */
	@Patch(':id/pin')
	pin(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		return this.memoService.pin(id, req.user.id);
	}

	/**
	 * メモのピン留めを解除する
	 * DELETE /memos/:id/pin
	 */
	@Delete(':id/pin')
	unpin(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		return this.memoService.unpin(id, req.user.id);
	}

	/**
	 * ゴミ箱内メモを完全削除する
	 * DELETE /memos/:id/permanent
	 */
	@Delete(':id/permanent')
	permanentDelete(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		return this.memoService.permanentDelete(id, req.user.id);
	}

	/**
	 * メモを公開状態に切り替える
	 * POST /memos/:id/share
	 */
	@Post(':id/share')
	publish(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		return this.memoSharingService.publishMemo(id, req.user.id);
	}

	/**
	 * メモの公開を解除する
	 * DELETE /memos/:id/share
	 */
	@Delete(':id/share')
	async unpublish(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		await this.memoSharingService.unpublishMemo(id, req.user.id);
		return { success: true };
	}

	/**
	 * 公開トークンを再生成する
	 * POST /memos/:id/share/regenerate
	 */
	@Post(':id/share/regenerate')
	regenerateShare(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		return this.memoSharingService.regenerateToken(id, req.user.id);
	}
}

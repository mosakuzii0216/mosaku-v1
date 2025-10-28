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

	@Get()
	findAll(@Query('tagIds') tagIds: string | string[], @Request() req: AuthenticatedRequest) {
		const tagIdArray = Array.isArray(tagIds) ? tagIds : tagIds ? [tagIds] : undefined;
		return this.memoService.findAll(req.user.id, tagIdArray);
	}

	@Get('search')
	search(
		@Query() searchMemoDto: SearchMemoDto,
		@Query('tagIds') tagIds: string | string[],
		@Request() req: AuthenticatedRequest,
	) {
		const tagIdArray = Array.isArray(tagIds) ? tagIds : tagIds ? [tagIds] : undefined;
		return this.memoService.search(searchMemoDto.q || '', req.user.id, tagIdArray);
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

	@Delete(':id')
	remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		return this.memoService.remove(id, req.user.id);
	}
}

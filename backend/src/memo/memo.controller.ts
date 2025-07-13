import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ValidationPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MemoService } from './memo.service';
import { CreateMemoDto } from './dto/create-memo.dto';
import { UpdateMemoDto } from './dto/update-memo.dto';
import { SearchMemoDto } from './dto/search-memo.dto';
import { SupabaseGuard } from '../auth/supabase.guard';

@Controller('memos')
@UseGuards(SupabaseGuard)
export class MemoController {
  constructor(private readonly memoService: MemoService) {}

  @Post()
  create(@Body(ValidationPipe) createMemoDto: CreateMemoDto, @Request() req) {
    return this.memoService.create(createMemoDto, req.user.id);
  }

  @Get()
  findAll(@Query('tagIds') tagIds: string | string[], @Request() req) {
    const tagIdArray = Array.isArray(tagIds) ? tagIds : tagIds ? [tagIds] : undefined;
    return this.memoService.findAll(req.user.id, tagIdArray);
  }

  @Get('search')
  search(
    @Query(ValidationPipe) searchMemoDto: SearchMemoDto,
    @Query('tagIds') tagIds: string | string[],
    @Request() req,
  ) {
    const tagIdArray = Array.isArray(tagIds) ? tagIds : tagIds ? [tagIds] : undefined;
    return this.memoService.search(searchMemoDto.q || '', req.user.id, tagIdArray);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.memoService.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateMemoDto: UpdateMemoDto,
    @Request() req,
  ) {
    return this.memoService.update(id, updateMemoDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.memoService.remove(id, req.user.id);
  }
}

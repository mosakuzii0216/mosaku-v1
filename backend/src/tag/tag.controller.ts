import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { TagService } from './tag.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { SearchTagDto } from './dto/search-tag.dto';
import { AssignTagsDto } from './dto/assign-tags.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types';

@Controller('tags')
@UseGuards(JwtAuthGuard)
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Post()
  create(@Body() createTagDto: CreateTagDto, @Request() req: AuthenticatedRequest) {
    return this.tagService.create(createTagDto, req.user.id);
  }

  @Get()
  findAll(@Request() req: AuthenticatedRequest) {
    return this.tagService.findAll(req.user.id);
  }

  @Get('search')
  search(@Query() searchTagDto: SearchTagDto, @Request() req: AuthenticatedRequest) {
    return this.tagService.search(searchTagDto.q || '', req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.tagService.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTagDto: UpdateTagDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.tagService.update(id, updateTagDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.tagService.remove(id, req.user.id);
  }

  @Post('memo/:memoId/assign')
  assignTagsToMemo(
    @Param('memoId') memoId: string,
    @Body() assignTagsDto: AssignTagsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.tagService.assignTagsToMemo(memoId, assignTagsDto, req.user.id);
  }

  @Get('memo/:memoId')
  getMemoTags(@Param('memoId') memoId: string, @Request() req: AuthenticatedRequest) {
    return this.tagService.getMemoTags(memoId, req.user.id);
  }
}

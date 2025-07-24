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
import { TagService } from './tag.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { SearchTagDto } from './dto/search-tag.dto';
import { AssignTagsDto } from './dto/assign-tags.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('tags')
@UseGuards(JwtAuthGuard)
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Post()
  create(@Body(ValidationPipe) createTagDto: CreateTagDto, @Request() req) {
    return this.tagService.create(createTagDto, req.user.id);
  }

  @Get()
  findAll(@Request() req) {
    return this.tagService.findAll(req.user.id);
  }

  @Get('search')
  search(@Query(ValidationPipe) searchTagDto: SearchTagDto, @Request() req) {
    return this.tagService.search(searchTagDto.q || '', req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.tagService.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateTagDto: UpdateTagDto,
    @Request() req,
  ) {
    return this.tagService.update(id, updateTagDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.tagService.remove(id, req.user.id);
  }

  @Post('memo/:memoId/assign')
  assignTagsToMemo(
    @Param('memoId') memoId: string,
    @Body(ValidationPipe) assignTagsDto: AssignTagsDto,
    @Request() req,
  ) {
    return this.tagService.assignTagsToMemo(memoId, assignTagsDto, req.user.id);
  }

  @Get('memo/:memoId')
  getMemoTags(@Param('memoId') memoId: string, @Request() req) {
    return this.tagService.getMemoTags(memoId, req.user.id);
  }
}

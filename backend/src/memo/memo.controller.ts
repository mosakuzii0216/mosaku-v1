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
} from '@nestjs/common';
import { MemoService } from './memo.service';
import { CreateMemoDto } from './dto/create-memo.dto';
import { UpdateMemoDto } from './dto/update-memo.dto';
import { SearchMemoDto } from './dto/search-memo.dto';

@Controller('api/memos')
export class MemoController {
  constructor(private readonly memoService: MemoService) {}

  @Post()
  create(@Body(ValidationPipe) createMemoDto: CreateMemoDto) {
    return this.memoService.create(createMemoDto);
  }

  @Get()
  findAll() {
    return this.memoService.findAll();
  }

  @Get('search')
  search(@Query(ValidationPipe) searchMemoDto: SearchMemoDto) {
    return this.memoService.search(searchMemoDto.q || '');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.memoService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateMemoDto: UpdateMemoDto,
  ) {
    return this.memoService.update(id, updateMemoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.memoService.remove(id);
  }
}

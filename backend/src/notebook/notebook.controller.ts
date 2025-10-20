import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	Request,
	UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { NotebookService } from './notebook.service';
import { CreateNotebookDto } from './dto/create-notebook.dto/create-notebook.dto';
import { AuthenticatedRequest } from 'src/auth/types';
import { UpdateNotebookDto } from './dto/update-notebook.dto/update-notebook.dto';

@Controller('notebook')
@UseGuards(JwtAuthGuard)
export class NotebookController {
	constructor(private readonly notebookService: NotebookService) {}

	@Post()
	create(@Body() dto: CreateNotebookDto, @Request() req: AuthenticatedRequest) {
		return this.notebookService.create(dto, req.user.id);
	}

	@Get()
	findAll(@Request() req: AuthenticatedRequest) {
		return this.notebookService.findAll(req.user.id);
	}

	@Get(':id')
	findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		return this.notebookService.findOne(id, req.user.id);
	}

	@Patch(':id')
	update(
		@Param('id') id: string,
		@Body() dto: UpdateNotebookDto,
		@Request() req: AuthenticatedRequest,
	) {
		return this.notebookService.update(id, dto, req.user.id);
	}

	@Delete(':id')
	delete(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		return this.notebookService.delete(id, req.user.id);
	}
}

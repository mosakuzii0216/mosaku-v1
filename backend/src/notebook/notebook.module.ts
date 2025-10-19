import { Module } from '@nestjs/common';
import { NotebookService } from './notebook.service';
import { NotebookController } from './notebook.controller';

@Module({
  providers: [NotebookService],
  controllers: [NotebookController]
})
export class NotebookModule {}

import { IsString, MaxLength, IsOptional } from 'class-validator';

export class UpdateNotebookDto {
	@IsString()
	@MaxLength(100)
	name?: string;

	@IsString()
	@IsOptional()
	themeId?: string;
}

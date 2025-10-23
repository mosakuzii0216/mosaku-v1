import { IsString, MaxLength, IsOptional } from 'class-validator';

export class UpdateNotebookDto {
	@IsString()
	@IsOptional()
	@MaxLength(100)
	name?: string | null;

	@IsString()
	@IsOptional()
	themeId?: string | null;

	@IsString()
	@IsOptional()
	content?: string | null;
}

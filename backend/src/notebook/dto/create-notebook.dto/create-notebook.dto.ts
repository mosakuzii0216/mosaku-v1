import { IsString, MaxLength, IsOptional } from 'class-validator';

export class CreateNotebookDto {
	@IsString()
	@IsOptional()
	@MaxLength(100)
	name?: string;

	@IsString()
	@IsOptional()
	themeId?: string;
}

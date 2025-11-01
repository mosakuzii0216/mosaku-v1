import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class CreateMemoDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	title: string;

	@IsString()
	content: string;

	@IsString()
	@IsOptional()
	themeId?: string; // テーマID（オプショナル）

	@IsString()
	@IsOptional()
	notebookId?: string; // ノートブックID（オプショナル、未指定はInbox）
}

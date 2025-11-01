import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateMemoDto {
	@IsString()
	@IsOptional()
	@MaxLength(100)
	title?: string;

	@IsString()
	@IsOptional()
	content?: string;

	@IsString()
	@IsOptional()
	themeId?: string; // テーマID（オプショナル）

	@IsString()
	@IsOptional()
	notebookId?: string; // ノートブックID（オプショナル、未指定はInbox）
}

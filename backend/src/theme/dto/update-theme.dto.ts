import { IsString, IsOptional, MaxLength, IsBoolean, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateThemeDto {
	@IsString()
	@IsOptional()
	@MaxLength(50)
	name?: string;

	@IsString()
	@IsOptional()
	@MaxLength(200)
	description?: string;

	@IsBoolean()
	@IsOptional()
	@Transform(({ value }) => value === 'true' || value === true)
	isPublic?: boolean;

	@IsObject()
	@IsOptional()
	styles?: Record<string, unknown>; // ThemeStyles型だが、JSONのためunknownで受け取り

	@IsString()
	@IsOptional()
	@MaxLength(255)
	cssFilePath?: string; // CSSファイルパス

	@IsObject()
	@IsOptional()
	metadata?: Record<string, unknown>; // メタデータ（JSON）
}

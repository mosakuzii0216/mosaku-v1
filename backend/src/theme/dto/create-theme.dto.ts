import { IsString, IsNotEmpty, MaxLength, IsBoolean, IsOptional, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateThemeDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(50)
	name: string;

	@IsString()
	@IsOptional()
	@MaxLength(200)
	description?: string;

	@IsBoolean()
	@IsOptional()
	@Transform(({ value }) => value === 'true' || value === true)
	isPublic?: boolean = false;

	@IsObject()
	@IsOptional()
	styles?: Record<string, unknown>; // ThemeStyles型だが、JSONのためunknownで受け取り（CSSファイル使用時は不要）

	@IsString()
	@IsOptional()
	@MaxLength(255)
	cssFilePath?: string; // CSSファイルパス

	@IsObject()
	@IsOptional()
	metadata?: Record<string, unknown>; // メタデータ（JSON）
}

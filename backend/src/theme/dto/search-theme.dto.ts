import { IsString, IsOptional, IsBoolean, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchThemeDto {
	@IsString()
	@IsOptional()
	query?: string; // テーマ名または説明で検索

	@IsString()
	@IsOptional()
	@IsIn(['basic', 'business', 'creative', 'study', 'seasonal', 'accessibility'])
	category?: string; // カテゴリフィルター

	@IsBoolean()
	@IsOptional()
	@Transform(({ value }) => value === 'true' || value === true)
	isSystem?: boolean; // システムテーマのみ

	@IsBoolean()
	@IsOptional()
	@Transform(({ value }) => value === 'true' || value === true)
	isPublic?: boolean; // 公開テーマのみ

	@IsBoolean()
	@IsOptional()
	@Transform(({ value }) => value === 'true' || value === true)
	favoritesOnly?: boolean; // お気に入りのみ（ログイン時）
}

import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';

export class UpdateTagDto {
	@IsOptional()
	@IsString()
	@MaxLength(50)
	name?: string;

	@IsOptional()
	@IsString()
	@Matches(/^#[0-9A-Fa-f]{6}$/, {
		message: 'color must be a valid hex color code (e.g., #FF5733)',
	})
	color?: string;
}

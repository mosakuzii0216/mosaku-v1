import { IsString, IsNotEmpty } from 'class-validator';

export class FavoriteThemeDto {
	@IsString()
	@IsNotEmpty()
	themeId: string;
}

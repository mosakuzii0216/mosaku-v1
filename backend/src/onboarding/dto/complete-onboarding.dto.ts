import { IsString, IsNotEmpty } from 'class-validator';

export class CompleteOnboardingDto {
	@IsString()
	@IsNotEmpty()
	themeId: string;
}

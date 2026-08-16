import { IsEnum, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export enum FeedbackCategory {
	Bug = 'bug',
	Improvement = 'improvement',
	Other = 'other',
}

export class CreateFeedbackDto {
	@IsEnum(FeedbackCategory)
	category: FeedbackCategory;

	@IsString()
	@IsNotEmpty()
	@MaxLength(1000)
	message: string;
}

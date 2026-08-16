export type FeedbackCategory = 'bug' | 'improvement' | 'other';

export interface SubmitFeedbackDto {
	category: FeedbackCategory;
	message: string;
}

import { IsNotEmpty, Matches } from 'class-validator';

const YYYY_MM_DD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ActivityDatesQueryDto {
	@IsNotEmpty()
	@Matches(YYYY_MM_DD_PATTERN, { message: 'from must be in YYYY-MM-DD format' })
	from!: string;

	@IsNotEmpty()
	@Matches(YYYY_MM_DD_PATTERN, { message: 'to must be in YYYY-MM-DD format' })
	to!: string;
}

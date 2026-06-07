import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateFeedbackDto, FeedbackCategory } from './create-feedback.dto';

describe('CreateFeedbackDto', () => {
	describe('category', () => {
		it('有効なカテゴリ bug は通過する', async () => {
			const dto = plainToInstance(CreateFeedbackDto, {
				category: FeedbackCategory.Bug,
				message: 'テストメッセージ',
			});
			const errors = await validate(dto);
			expect(errors.filter((e) => e.property === 'category')).toHaveLength(0);
		});

		it('有効なカテゴリ improvement は通過する', async () => {
			const dto = plainToInstance(CreateFeedbackDto, {
				category: FeedbackCategory.Improvement,
				message: 'テストメッセージ',
			});
			const errors = await validate(dto);
			expect(errors.filter((e) => e.property === 'category')).toHaveLength(0);
		});

		it('有効なカテゴリ other は通過する', async () => {
			const dto = plainToInstance(CreateFeedbackDto, {
				category: FeedbackCategory.Other,
				message: 'テストメッセージ',
			});
			const errors = await validate(dto);
			expect(errors.filter((e) => e.property === 'category')).toHaveLength(0);
		});

		it('category が未指定の場合はバリデーションエラーになる', async () => {
			const dto = plainToInstance(CreateFeedbackDto, {
				message: 'テストメッセージ',
			});
			const errors = await validate(dto);
			expect(errors.some((e) => e.property === 'category')).toBe(true);
		});

		it('不正な category 値はバリデーションエラーになる', async () => {
			const dto = plainToInstance(CreateFeedbackDto, {
				category: 'invalid',
				message: 'テストメッセージ',
			});
			const errors = await validate(dto);
			expect(errors.some((e) => e.property === 'category')).toBe(true);
		});
	});

	describe('message', () => {
		it('1〜1000文字のメッセージは通過する', async () => {
			const dto = plainToInstance(CreateFeedbackDto, {
				category: FeedbackCategory.Bug,
				message: 'A'.repeat(1000),
			});
			const errors = await validate(dto);
			expect(errors.filter((e) => e.property === 'message')).toHaveLength(0);
		});

		it('message が空文字の場合はバリデーションエラーになる', async () => {
			const dto = plainToInstance(CreateFeedbackDto, {
				category: FeedbackCategory.Bug,
				message: '',
			});
			const errors = await validate(dto);
			expect(errors.some((e) => e.property === 'message')).toBe(true);
		});

		it('message が未指定の場合はバリデーションエラーになる', async () => {
			const dto = plainToInstance(CreateFeedbackDto, {
				category: FeedbackCategory.Bug,
			});
			const errors = await validate(dto);
			expect(errors.some((e) => e.property === 'message')).toBe(true);
		});

		it('1001文字のメッセージはバリデーションエラーになる', async () => {
			const dto = plainToInstance(CreateFeedbackDto, {
				category: FeedbackCategory.Bug,
				message: 'A'.repeat(1001),
			});
			const errors = await validate(dto);
			expect(errors.some((e) => e.property === 'message')).toBe(true);
		});
	});
});

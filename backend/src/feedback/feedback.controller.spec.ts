import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import type { AuthenticatedRequest } from '../auth/types';
import { FeedbackCategory } from './dto/create-feedback.dto';

describe('FeedbackController', () => {
	let controller: FeedbackController;
	let feedbackService: { submit: jest.Mock };

	beforeEach(async () => {
		feedbackService = {
			submit: jest.fn().mockResolvedValue(undefined),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [FeedbackController],
			providers: [{ provide: FeedbackService, useValue: feedbackService }],
		}).compile();

		controller = module.get<FeedbackController>(FeedbackController);
	});

	const buildAuthReq = (name: string, email: string): AuthenticatedRequest =>
		({
			user: {
				id: 'user-id-1',
				email,
				name,
				role: 'USER',
			},
		}) as unknown as AuthenticatedRequest;

	describe('POST /feedback', () => {
		it('FeedbackService.submit を dto と req.user の userId/name/email を渡して呼ぶこと', async () => {
			const dto = { category: FeedbackCategory.Bug, message: 'テストバグ' };
			const req = buildAuthReq('喜多川海夢', 'kaito@example.com');

			await controller.submit(dto, req);

			expect(feedbackService.submit).toHaveBeenCalledWith(dto, {
				userId: 'user-id-1',
				name: '喜多川海夢',
				email: 'kaito@example.com',
			});
		});

		it('undefined のとき name は空文字にフォールバックすること', async () => {
			const dto = { category: FeedbackCategory.Other, message: 'その他のフィードバック' };
			const req = {
				user: { id: 'u1', email: 'test@example.com', role: 'USER' },
			} as unknown as AuthenticatedRequest;

			await controller.submit(dto, req);

			expect(feedbackService.submit).toHaveBeenCalledWith(dto, {
				userId: 'u1',
				name: '',
				email: 'test@example.com',
			});
		});
	});
});

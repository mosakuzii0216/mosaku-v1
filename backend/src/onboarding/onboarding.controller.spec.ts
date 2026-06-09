import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import type { AuthenticatedRequest } from '../auth/types';

const buildAuthReq = (userId = 'user-1'): AuthenticatedRequest =>
	({
		user: { id: userId, email: 'test@example.com', role: 'USER' },
	}) as unknown as AuthenticatedRequest;

describe('OnboardingController', () => {
	let controller: OnboardingController;
	let onboardingService: { complete: jest.Mock; skip: jest.Mock };

	beforeEach(async () => {
		onboardingService = {
			complete: jest.fn().mockResolvedValue({ notebookId: 'nb-1', memoIds: ['m-1', 'm-2'] }),
			skip: jest.fn().mockResolvedValue(undefined),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [OnboardingController],
			providers: [{ provide: OnboardingService, useValue: onboardingService }],
		}).compile();

		controller = module.get<OnboardingController>(OnboardingController);
	});

	describe('POST /onboarding/complete', () => {
		it('OnboardingService.complete を userId と themeId で呼び、結果を返すこと', async () => {
			const dto = { themeId: 'theme-123' };
			const req = buildAuthReq('user-1');

			const result = await controller.complete(dto, req);

			expect(onboardingService.complete).toHaveBeenCalledWith('user-1', 'theme-123');
			expect(result).toEqual({ notebookId: 'nb-1', memoIds: ['m-1', 'm-2'] });
		});

		it('サービスが早期リターンした場合（べき等）も結果をそのまま返すこと', async () => {
			onboardingService.complete.mockResolvedValue({ notebookId: '', memoIds: [] });
			const dto = { themeId: 'theme-123' };
			const req = buildAuthReq('user-1');

			const result = await controller.complete(dto, req);

			expect(result).toEqual({ notebookId: '', memoIds: [] });
		});
	});

	describe('POST /onboarding/skip', () => {
		it('OnboardingService.skip を userId で呼び、{ message } を返すこと', async () => {
			const req = buildAuthReq('user-1');

			const result = await controller.skip(req);

			expect(onboardingService.skip).toHaveBeenCalledWith('user-1');
			expect(result).toEqual({ message: 'skipped' });
		});
	});
});

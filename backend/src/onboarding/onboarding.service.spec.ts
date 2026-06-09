import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingService } from './onboarding.service';
import { NotebookService } from '../notebook/notebook.service';
import { MemoService } from '../memo/memo.service';
import { PrismaService } from '../prisma/prisma.service';

const mockNotebookService = {
	create: jest.fn(),
};

const mockMemoService = {
	create: jest.fn(),
};

const makeMockTx = () => ({
	notebook: { create: jest.fn() },
	memo: { create: jest.fn() },
	user: { update: jest.fn() },
});

type MockTx = ReturnType<typeof makeMockTx>;

const mockPrisma = {
	user: { findUnique: jest.fn() },
	$transaction: jest.fn(),
};

describe('OnboardingService', () => {
	let service: OnboardingService;

	beforeEach(async () => {
		jest.clearAllMocks();

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				OnboardingService,
				{ provide: NotebookService, useValue: mockNotebookService },
				{ provide: MemoService, useValue: mockMemoService },
				{ provide: PrismaService, useValue: mockPrisma },
			],
		}).compile();

		service = module.get<OnboardingService>(OnboardingService);
	});

	describe('complete()', () => {
		it('onboardingCompleted が true の場合は早期リターンして重複作成しないこと（べき等）', async () => {
			mockPrisma.user.findUnique.mockResolvedValue({
				id: 'user-1',
				onboardingCompleted: true,
			});

			const result = await service.complete('user-1', 'theme-1');

			expect(result).toEqual({ notebookId: '', memoIds: [] });
			expect(mockPrisma.$transaction).not.toHaveBeenCalled();
		});

		it('正常系: ようこそノートブック + サンプルメモ 2 枚 + onboardingCompleted=true が作成されること', async () => {
			mockPrisma.user.findUnique.mockResolvedValue({
				id: 'user-1',
				onboardingCompleted: false,
			});

			const mockTx: MockTx = makeMockTx();
			mockTx.notebook.create.mockResolvedValue({ id: 'notebook-1' });
			mockTx.memo.create
				.mockResolvedValueOnce({ id: 'memo-1' })
				.mockResolvedValueOnce({ id: 'memo-2' });
			mockTx.user.update.mockResolvedValue({ id: 'user-1', onboardingCompleted: true });

			mockPrisma.$transaction.mockImplementation(async (fn: (tx: MockTx) => Promise<unknown>) => {
				return fn(mockTx);
			});

			const result = await service.complete('user-1', 'theme-1');

			expect(result).toEqual({ notebookId: 'notebook-1', memoIds: ['memo-1', 'memo-2'] });

			// ノートブック作成の確認
			expect(mockTx.notebook.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						name: 'ようこそ',
						user: { connect: { id: 'user-1' } },
						theme: { connect: { id: 'theme-1' } },
					}),
				}),
			);

			// メモ 2 枚作成の確認
			expect(mockTx.memo.create).toHaveBeenCalledTimes(2);
			expect(mockTx.memo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						userId: 'user-1',
						notebookId: 'notebook-1',
					}),
				}),
			);

			// onboardingCompleted 更新の確認
			expect(mockTx.user.update).toHaveBeenCalledWith({
				where: { id: 'user-1' },
				data: { onboardingCompleted: true },
			});
		});

		it('themeId が不正でトランザクションが失敗した場合はエラーが伝播すること', async () => {
			mockPrisma.user.findUnique.mockResolvedValue({
				id: 'user-1',
				onboardingCompleted: false,
			});

			mockPrisma.$transaction.mockRejectedValue(new Error('Foreign key constraint violation'));

			await expect(service.complete('user-1', 'invalid-theme')).rejects.toThrow();
		});
	});

	describe('skip()', () => {
		it('onboardingCompleted=true のみ更新し、ノートブック・メモを作成しないこと', async () => {
			mockPrisma.user.findUnique.mockResolvedValue({
				id: 'user-1',
				onboardingCompleted: false,
			});

			const updateMock = jest.fn().mockResolvedValue({ id: 'user-1', onboardingCompleted: true });
			(mockPrisma as { user: { findUnique: jest.Mock; update?: jest.Mock } }).user.update =
				updateMock;

			await service.skip('user-1');

			expect(updateMock).toHaveBeenCalledWith({
				where: { id: 'user-1' },
				data: { onboardingCompleted: true },
			});
			expect(mockPrisma.$transaction).not.toHaveBeenCalled();
		});

		it('既に onboardingCompleted=true の場合でもエラーにならないこと', async () => {
			const updateMock = jest.fn().mockResolvedValue({ id: 'user-1', onboardingCompleted: true });
			(mockPrisma as { user: { findUnique: jest.Mock; update?: jest.Mock } }).user.update =
				updateMock;

			await expect(service.skip('user-1')).resolves.toBeUndefined();
		});
	});
});

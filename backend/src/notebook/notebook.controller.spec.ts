import { Test, TestingModule } from '@nestjs/testing';
import { NotebookController } from './notebook.controller';
import { NotebookService } from './notebook.service';

describe('NotebookController', () => {
	let controller: NotebookController;

	// NotebookServiceのモック
	const mockNotebookService = {
		create: jest.fn(),
		findAll: jest.fn(),
		findOne: jest.fn(),
		update: jest.fn(),
		remove: jest.fn(),
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [NotebookController],
			providers: [
				{
					provide: NotebookService,
					useValue: mockNotebookService,
				},
			],
		}).compile();

		controller = module.get<NotebookController>(NotebookController);
	});

	it('should be defined', () => {
		expect(controller).toBeDefined();
	});
});

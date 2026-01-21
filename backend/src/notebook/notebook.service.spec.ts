import { Test, TestingModule } from '@nestjs/testing';
import { NotebookService } from './notebook.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthorizationService } from 'src/common/services/authorization.service';

describe('NotebookService', () => {
	let service: NotebookService;

	// PrismaServiceのモック
	const mockPrismaService = {
		notebook: {
			findMany: jest.fn(),
			findUnique: jest.fn(),
			create: jest.fn(),
			update: jest.fn(),
			delete: jest.fn(),
		},
	};

	// AuthorizationServiceのモック
	const mockAuthorizationService = {
		checkOwnership: jest.fn(),
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				NotebookService,
				{
					provide: PrismaService,
					useValue: mockPrismaService,
				},
				{
					provide: AuthorizationService,
					useValue: mockAuthorizationService,
				},
			],
		}).compile();

		service = module.get<NotebookService>(NotebookService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});
});

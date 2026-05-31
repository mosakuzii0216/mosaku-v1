import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { DbPoolObservabilityService } from './db-pool-observability.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
	$queryRawUnsafe: jest.fn(),
};

interface EmittedPayload {
	message: string;
	feature_area: string;
	used: number;
	max: number;
	util_ratio: number;
	severity: string;
}

describe('DbPoolObservabilityService', () => {
	let service: DbPoolObservabilityService;
	let logSpy: jest.SpyInstance;

	const lastPayload = (): EmittedPayload => {
		const calls = logSpy.mock.calls;
		const raw = calls[calls.length - 1][0] as string;
		return JSON.parse(raw) as EmittedPayload;
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				DbPoolObservabilityService,
				{ provide: PrismaService, useValue: mockPrismaService },
			],
		}).compile();

		service = module.get<DbPoolObservabilityService>(DbPoolObservabilityService);
		jest.clearAllMocks();
		delete process.env.DB_POOL_MAX_CONNECTIONS;
		logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
		jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	it('db_pool_utilization を固定キーで used/max/util_ratio とともに 1 行発出する', async () => {
		mockPrismaService.$queryRawUnsafe.mockResolvedValue([{ used: 20, max: 100 }]);

		await service.sampleDbPoolUtilization();

		expect(logSpy).toHaveBeenCalledTimes(1);
		const payload = lastPayload();
		expect(payload.message).toBe('db_pool_utilization');
		expect(payload.feature_area).toBe('system');
		expect(payload.used).toBe(20);
		expect(payload.max).toBe(100);
		expect(payload.util_ratio).toBeCloseTo(0.2, 5);
		expect(payload.severity).toBe('INFO');
	});

	it('使用率が 80% 以上のとき severity を WARNING にする', async () => {
		mockPrismaService.$queryRawUnsafe.mockResolvedValue([{ used: 85, max: 100 }]);

		await service.sampleDbPoolUtilization();

		const payload = lastPayload();
		expect(payload.util_ratio).toBeCloseTo(0.85, 5);
		expect(payload.severity).toBe('WARNING');
	});

	it('DB_POOL_MAX_CONNECTIONS が設定されていればそれを分母に使う', async () => {
		process.env.DB_POOL_MAX_CONNECTIONS = '50';
		mockPrismaService.$queryRawUnsafe.mockResolvedValue([{ used: 30, max: 200 }]);

		await service.sampleDbPoolUtilization();

		const payload = lastPayload();
		expect(payload.max).toBe(50);
		expect(payload.util_ratio).toBeCloseTo(0.6, 5);
	});

	it('クエリ失敗時は握り潰し、例外を投げずログも発出しない', async () => {
		mockPrismaService.$queryRawUnsafe.mockRejectedValue(new Error('db down'));

		await expect(service.sampleDbPoolUtilization()).resolves.toBeUndefined();
		expect(logSpy).not.toHaveBeenCalled();
	});

	it('max が 0 や不正なら util_ratio を発出せず握り潰す（ゼロ除算回避）', async () => {
		mockPrismaService.$queryRawUnsafe.mockResolvedValue([{ used: 5, max: 0 }]);

		await service.sampleDbPoolUtilization();

		expect(logSpy).not.toHaveBeenCalled();
	});
});

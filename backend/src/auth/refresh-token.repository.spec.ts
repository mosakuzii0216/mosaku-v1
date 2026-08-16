import { Test, TestingModule } from '@nestjs/testing';
import { RefreshTokenRepository } from './refresh-token.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('RefreshTokenRepository', () => {
	let repository: RefreshTokenRepository;

	const mockRefreshToken = {
		findUnique: jest.fn(),
		create: jest.fn(),
		updateMany: jest.fn(),
		deleteMany: jest.fn(),
	};

	const mockPrisma = {
		refreshToken: mockRefreshToken,
	};

	const sampleRecord = {
		id: 'rt-1',
		userId: 'user-1',
		tokenHash: 'hash-1',
		familyId: '11111111-1111-1111-1111-111111111111',
		status: 'active' as const,
		issuedAt: new Date('2026-01-01T00:00:00Z'),
		expiresAt: new Date('2026-02-01T00:00:00Z'),
		lastUsedAt: null,
		ip: '127.0.0.1',
		userAgent: 'jest',
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [RefreshTokenRepository, { provide: PrismaService, useValue: mockPrisma }],
		}).compile();

		repository = module.get<RefreshTokenRepository>(RefreshTokenRepository);
		jest.clearAllMocks();
	});

	describe('create', () => {
		it('Prisma に渡すデータが入力と一致し、生成されたレコードを返す', async () => {
			mockRefreshToken.create.mockResolvedValue(sampleRecord);

			const input = {
				userId: 'user-1',
				tokenHash: 'hash-1',
				familyId: '11111111-1111-1111-1111-111111111111',
				status: 'active' as const,
				issuedAt: new Date('2026-01-01T00:00:00Z'),
				expiresAt: new Date('2026-02-01T00:00:00Z'),
				ip: '127.0.0.1',
				userAgent: 'jest',
			};
			const result = await repository.create(input);

			expect(mockRefreshToken.create).toHaveBeenCalledWith({ data: input });
			expect(result).toEqual(sampleRecord);
		});

		it('tx クライアントが渡されたら tx 側の create を使う', async () => {
			const txCreate = jest.fn().mockResolvedValue(sampleRecord);
			const tx = { refreshToken: { create: txCreate } } as never;

			await repository.create(
				{
					userId: 'user-1',
					tokenHash: 'hash-1',
					familyId: '11111111-1111-1111-1111-111111111111',
					status: 'active',
					issuedAt: new Date(),
					expiresAt: new Date(),
					ip: null,
					userAgent: null,
				},
				tx,
			);

			expect(txCreate).toHaveBeenCalledTimes(1);
			expect(mockRefreshToken.create).not.toHaveBeenCalled();
		});
	});

	describe('findByHash', () => {
		it('tokenHash で findUnique を呼んでレコードを返す', async () => {
			mockRefreshToken.findUnique.mockResolvedValue(sampleRecord);

			const result = await repository.findByHash('hash-1');

			expect(mockRefreshToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: 'hash-1' } });
			expect(result).toEqual(sampleRecord);
		});

		it('見つからなければ null を返す', async () => {
			mockRefreshToken.findUnique.mockResolvedValue(null);

			const result = await repository.findByHash('missing-hash');

			expect(result).toBeNull();
		});
	});

	describe('markRotated', () => {
		it('status=active の RT のみを rotated に遷移させ、更新後のレコードを返す', async () => {
			mockRefreshToken.updateMany.mockResolvedValue({ count: 1 });
			mockRefreshToken.findUnique.mockResolvedValue({ ...sampleRecord, status: 'rotated' });
			const lastUsedAt = new Date('2026-01-15T00:00:00Z');

			const result = await repository.markRotated('rt-1', lastUsedAt);

			expect(mockRefreshToken.updateMany).toHaveBeenCalledWith({
				where: { id: 'rt-1', status: 'active' },
				data: { status: 'rotated', lastUsedAt },
			});
			expect(result?.status).toBe('rotated');
		});

		it('既に rotated/revoked なら count=0 で null を返す（status 逆遷移を防ぐ）', async () => {
			mockRefreshToken.updateMany.mockResolvedValue({ count: 0 });

			const result = await repository.markRotated('rt-1', new Date());

			expect(result).toBeNull();
			expect(mockRefreshToken.findUnique).not.toHaveBeenCalled();
		});
	});

	describe('revoke', () => {
		it('対象 1 件のみを revoked に遷移させ、更新後のレコードを返す', async () => {
			mockRefreshToken.updateMany.mockResolvedValue({ count: 1 });
			mockRefreshToken.findUnique.mockResolvedValue({ ...sampleRecord, status: 'revoked' });

			const result = await repository.revoke('rt-1');

			expect(mockRefreshToken.updateMany).toHaveBeenCalledWith({
				where: { id: 'rt-1', status: { in: ['active', 'rotated'] } },
				data: { status: 'revoked' },
			});
			expect(result?.status).toBe('revoked');
		});

		it('既に revoked なら null を返す', async () => {
			mockRefreshToken.updateMany.mockResolvedValue({ count: 0 });

			const result = await repository.revoke('rt-1');

			expect(result).toBeNull();
		});
	});

	describe('revokeByFamily', () => {
		it('familyId 配下の active/rotated を一括 revoke し、件数を返す', async () => {
			mockRefreshToken.updateMany.mockResolvedValue({ count: 3 });

			const result = await repository.revokeByFamily('11111111-1111-1111-1111-111111111111');

			expect(mockRefreshToken.updateMany).toHaveBeenCalledWith({
				where: {
					familyId: '11111111-1111-1111-1111-111111111111',
					status: { in: ['active', 'rotated'] },
				},
				data: { status: 'revoked' },
			});
			expect(result).toBe(3);
		});
	});

	describe('revokeAllForUser', () => {
		it('ユーザーの全 active/rotated を一括 revoke し、件数を返す', async () => {
			mockRefreshToken.updateMany.mockResolvedValue({ count: 5 });

			const result = await repository.revokeAllForUser('user-1');

			expect(mockRefreshToken.updateMany).toHaveBeenCalledWith({
				where: { userId: 'user-1', status: { in: ['active', 'rotated'] } },
				data: { status: 'revoked' },
			});
			expect(result).toBe(5);
		});
	});

	describe('pruneExpired', () => {
		it('expiresAt < now のレコードを物理削除し、件数を返す', async () => {
			mockRefreshToken.deleteMany.mockResolvedValue({ count: 7 });
			const now = new Date('2026-03-01T00:00:00Z');

			const result = await repository.pruneExpired(now);

			expect(mockRefreshToken.deleteMany).toHaveBeenCalledWith({
				where: { expiresAt: { lt: now } },
			});
			expect(result).toBe(7);
		});
	});
});

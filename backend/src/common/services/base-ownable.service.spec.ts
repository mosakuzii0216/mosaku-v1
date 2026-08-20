import { HttpStatus } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { BaseOwnableService, type PrismaModelDelegate } from './base-ownable.service';
import type { PrismaService } from '../../prisma/prisma.service';

interface TestEntity {
	id: string;
	userId: string;
	name?: string;
}

type TestDelegate = PrismaModelDelegate<TestEntity>;

// 型注釈を付けず推論に任せる。メソッド signature になると
// @typescript-eslint/unbound-method が expect(delegate.findMany) を弾くため。
const createDelegate = () => ({
	findMany: jest.fn(),
	findUnique: jest.fn(),
	create: jest.fn(),
	update: jest.fn(),
	delete: jest.fn(),
});

type MockDelegate = ReturnType<typeof createDelegate>;

const TEST_INCLUDE = { widgetTags: { include: { tag: true } } };

/**
 * getDefaultInclude / getDefaultOrderBy をオーバーライドしないサブクラス。
 * 基底クラスの既定値（include なし / updatedAt desc）を通す。
 */
class PlainService extends BaseOwnableService<TestEntity> {
	constructor(private readonly delegate: MockDelegate) {
		super({} as PrismaService, new AuthorizationService());
	}

	protected getModelDelegate(): TestDelegate {
		return this.delegate;
	}

	protected getEntityName(): string {
		return 'Widget';
	}

	// protected な CRUD を spec から叩けるように公開する
	public createEntity(data: object): Promise<TestEntity> {
		return this.createBase(data);
	}

	public updateEntity(id: string, data: object, userId: string): Promise<TestEntity> {
		return this.updateBase(id, data, userId);
	}
}

/** リレーションを含める（getDefaultInclude をオーバーライドする）サブクラス。 */
class IncludingService extends PlainService {
	protected getDefaultInclude(): object {
		return TEST_INCLUDE;
	}

	protected getDefaultOrderBy(): object {
		return { name: 'asc' };
	}
}

const entity = (overrides: Partial<TestEntity> = {}): TestEntity => ({
	id: 'entity-1',
	userId: 'user-1',
	...overrides,
});

let delegate: MockDelegate;
let plain: PlainService;
let including: IncludingService;

beforeEach(() => {
	delegate = createDelegate();
	plain = new PlainService(delegate);
	including = new IncludingService(delegate);
});

// ─── include を持たないサブクラス（基底の既定値） ─────────────────────────────

describe('getDefaultInclude を上書きしない場合', () => {
	it('findAll は既定の orderBy（updatedAt desc）を使い include を付けない', async () => {
		delegate.findMany.mockResolvedValue([entity()]);

		await plain.findAll('user-1');

		expect(delegate.findMany).toHaveBeenCalledWith({
			where: { userId: 'user-1' },
			orderBy: { updatedAt: 'desc' },
		});
	});

	it('findOne は include を付けない', async () => {
		delegate.findUnique.mockResolvedValue(entity());

		await plain.findOne('entity-1', 'user-1');

		expect(delegate.findUnique).toHaveBeenCalledWith({ where: { id: 'entity-1' } });
	});

	it('createBase は include を付けない', async () => {
		delegate.create.mockResolvedValue(entity());

		await plain.createEntity({ name: 'w', userId: 'user-1' });

		expect(delegate.create).toHaveBeenCalledWith({ data: { name: 'w', userId: 'user-1' } });
	});

	it('updateBase は include を付けない', async () => {
		delegate.findUnique.mockResolvedValue(entity());
		delegate.update.mockResolvedValue(entity({ name: 'renamed' }));

		await plain.updateEntity('entity-1', { name: 'renamed' }, 'user-1');

		expect(delegate.update).toHaveBeenCalledWith({
			where: { id: 'entity-1' },
			data: { name: 'renamed' },
		});
	});
});

// ─── include を持つサブクラス ────────────────────────────────────────────────

describe('getDefaultInclude を上書きした場合', () => {
	it('findAll は include と上書きした orderBy の両方を渡す', async () => {
		delegate.findMany.mockResolvedValue([entity()]);

		await including.findAll('user-1');

		expect(delegate.findMany).toHaveBeenCalledWith({
			where: { userId: 'user-1' },
			orderBy: { name: 'asc' },
			include: TEST_INCLUDE,
		});
	});

	it('findOne は include を渡す', async () => {
		delegate.findUnique.mockResolvedValue(entity());

		await including.findOne('entity-1', 'user-1');

		expect(delegate.findUnique).toHaveBeenCalledWith({
			where: { id: 'entity-1' },
			include: TEST_INCLUDE,
		});
	});

	it('createBase は include を渡す', async () => {
		delegate.create.mockResolvedValue(entity());

		await including.createEntity({ name: 'w', userId: 'user-1' });

		expect(delegate.create).toHaveBeenCalledWith({
			data: { name: 'w', userId: 'user-1' },
			include: TEST_INCLUDE,
		});
	});

	it('updateBase は include を渡す', async () => {
		delegate.findUnique.mockResolvedValue(entity());
		delegate.update.mockResolvedValue(entity());

		await including.updateEntity('entity-1', { name: 'renamed' }, 'user-1');

		expect(delegate.update).toHaveBeenCalledWith({
			where: { id: 'entity-1' },
			data: { name: 'renamed' },
			include: TEST_INCLUDE,
		});
	});
});

// ─── 所有権検証 ──────────────────────────────────────────────────────────────

describe('所有権検証', () => {
	it('findOne は存在しなければ 404 を投げ、エンティティ名をメッセージに含める', async () => {
		delegate.findUnique.mockResolvedValue(null);

		await expect(plain.findOne('missing', 'user-1')).rejects.toMatchObject({
			statusCode: HttpStatus.NOT_FOUND,
		});
		await expect(plain.findOne('missing', 'user-1')).rejects.toMatchObject({
			response: { message: 'Widget not found' },
		});
	});

	it('findOne は他人のエンティティなら 403 を投げる', async () => {
		delegate.findUnique.mockResolvedValue(entity({ userId: 'other-user' }));

		await expect(plain.findOne('entity-1', 'user-1')).rejects.toMatchObject({
			statusCode: HttpStatus.FORBIDDEN,
			response: { message: 'You can only access your own widgets' },
		});
	});

	it('remove は所有権検証に失敗したら delete を呼ばない', async () => {
		delegate.findUnique.mockResolvedValue(entity({ userId: 'other-user' }));

		await expect(plain.remove('entity-1', 'user-1')).rejects.toMatchObject({
			statusCode: HttpStatus.FORBIDDEN,
		});
		expect(delegate.delete).not.toHaveBeenCalled();
	});

	it('remove は所有者なら delete を呼ぶ（include は付けない）', async () => {
		delegate.findUnique.mockResolvedValue(entity());
		delegate.delete.mockResolvedValue(entity());

		await including.remove('entity-1', 'user-1');

		expect(delegate.delete).toHaveBeenCalledWith({ where: { id: 'entity-1' } });
	});

	it('updateBase は所有権検証に失敗したら update を呼ばない', async () => {
		delegate.findUnique.mockResolvedValue(entity({ userId: 'other-user' }));

		await expect(
			plain.updateEntity('entity-1', { name: 'renamed' }, 'user-1'),
		).rejects.toMatchObject({ statusCode: HttpStatus.FORBIDDEN });
		expect(delegate.update).not.toHaveBeenCalled();
	});

	it('createBase は所有権検証を行わない（userId は呼び出し側の責務）', async () => {
		delegate.create.mockResolvedValue(entity());

		await plain.createEntity({ userId: 'anyone' });

		expect(delegate.findUnique).not.toHaveBeenCalled();
		expect(delegate.create).toHaveBeenCalled();
	});
});

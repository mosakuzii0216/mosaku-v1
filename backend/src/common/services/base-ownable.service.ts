import { PrismaService } from '../../prisma/prisma.service';
import { AuthorizationService, OwnableEntity } from './authorization.service';

/**
 * Prismaモデルデリゲートの共通インターフェース
 */
export interface PrismaModelDelegate<Entity> {
	findMany(args: { where: object; include?: object; orderBy?: object }): Promise<Entity[]>;
	findUnique(args: { where: { id: string }; include?: object }): Promise<Entity | null>;
	create(args: { data: object; include?: object }): Promise<Entity>;
	update(args: { where: { id: string }; data: object; include?: object }): Promise<Entity>;
	delete(args: { where: { id: string } }): Promise<Entity>;
}

/**
 * 所有者権限を持つエンティティの基底サービスクラス
 *
 * 共通のCRUDパターンを抽象化し、各サービスでの重複を削減します。
 *
 * @template Entity - Prismaエンティティ型（userId を持つ）
 */
export abstract class BaseOwnableService<Entity extends OwnableEntity> {
	constructor(
		protected readonly prisma: PrismaService,
		protected readonly authorizationService: AuthorizationService,
	) {}

	/**
	 * Prismaモデルデリゲートを取得
	 * サブクラスで具体的なモデル（prisma.memo, prisma.tag等）を返す
	 */
	protected abstract getModelDelegate(): PrismaModelDelegate<Entity>;

	/**
	 * エンティティ名を取得（エラーメッセージ用）
	 */
	protected abstract getEntityName(): string;

	/**
	 * デフォルトのinclude句を取得
	 * リレーションを含める場合はオーバーライド
	 */
	protected getDefaultInclude(): object | undefined {
		return undefined;
	}

	/**
	 * デフォルトのorderBy句を取得
	 */
	protected getDefaultOrderBy(): object {
		return { updatedAt: 'desc' };
	}

	/**
	 * ユーザーの全エンティティを取得
	 */
	async findAll(userId: string): Promise<Entity[]> {
		const args: { where: object; include?: object; orderBy?: object } = {
			where: { userId },
			orderBy: this.getDefaultOrderBy(),
		};

		const include = this.getDefaultInclude();
		if (include) {
			args.include = include;
		}

		return this.getModelDelegate().findMany(args);
	}

	/**
	 * IDで1件取得（所有者検証込み）
	 */
	async findOne(id: string, userId: string): Promise<Entity> {
		const args: { where: { id: string }; include?: object } = {
			where: { id },
		};

		const include = this.getDefaultInclude();
		if (include) {
			args.include = include;
		}

		const entity = await this.getModelDelegate().findUnique(args);

		return this.authorizationService.validateOwnership(entity, userId, this.getEntityName());
	}

	/**
	 * エンティティを削除（所有者検証込み）
	 */
	async remove(id: string, userId: string): Promise<Entity> {
		// 所有者検証（findOneで行う）
		await this.findOne(id, userId);

		return this.getModelDelegate().delete({
			where: { id },
		});
	}

	/**
	 * エンティティを更新（所有者検証込み）
	 * @param id エンティティID
	 * @param data 更新データ
	 * @param userId ユーザーID
	 */
	protected async updateBase(id: string, data: object, userId: string): Promise<Entity> {
		// 所有者検証
		await this.findOne(id, userId);

		const args: { where: { id: string }; data: object; include?: object } = {
			where: { id },
			data,
		};

		const include = this.getDefaultInclude();
		if (include) {
			args.include = include;
		}

		return this.getModelDelegate().update(args);
	}

	/**
	 * エンティティを作成
	 * @param data 作成データ（userIdを含む）
	 */
	protected async createBase(data: object): Promise<Entity> {
		const args: { data: object; include?: object } = {
			data,
		};

		const include = this.getDefaultInclude();
		if (include) {
			args.include = include;
		}

		return this.getModelDelegate().create(args);
	}
}

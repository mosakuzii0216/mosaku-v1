import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';

export interface OwnableEntity {
  userId: string;
}

@Injectable()
export class AuthorizationService {
  /**
   * エンティティの存在と所有者権限を検証
   * @param entity 検証対象のエンティティ
   * @param userId 現在のユーザーID
   * @param entityName エンティティ名（エラーメッセージ用）
   * @returns 検証済みエンティティ
   * @throws NotFoundException エンティティが存在しない場合
   * @throws ForbiddenException 所有者権限がない場合
   */
  validateOwnership<T extends OwnableEntity>(
    entity: T | null,
    userId: string,
    entityName: string
  ): T {
    if (!entity) {
      throw new NotFoundException(`${entityName} not found`);
    }

    if (entity.userId !== userId) {
      throw new ForbiddenException(`You can only access your own ${entityName.toLowerCase()}s`);
    }

    return entity;
  }

  /**
   * エンティティの存在を検証（所有者チェックなし）
   * @param entity 検証対象のエンティティ
   * @param entityName エンティティ名（エラーメッセージ用）
   * @returns 検証済みエンティティ
   * @throws NotFoundException エンティティが存在しない場合
   */
  validateExistence<T>(entity: T | null, entityName: string): T {
    if (!entity) {
      throw new NotFoundException(`${entityName} not found`);
    }
    return entity;
  }

  /**
   * 複数エンティティの所有者権限を一括検証
   * @param entities 検証対象のエンティティ配列
   * @param userId 現在のユーザーID
   * @param entityName エンティティ名（エラーメッセージ用）
   * @returns 検証済みエンティティ配列
   * @throws ForbiddenException いずれかのエンティティに所有者権限がない場合
   */
  validateBulkOwnership<T extends OwnableEntity>(
    entities: T[],
    userId: string,
    entityName: string
  ): T[] {
    const unauthorizedEntity = entities.find(entity => entity.userId !== userId);
    
    if (unauthorizedEntity) {
      throw new ForbiddenException(`You can only access your own ${entityName.toLowerCase()}s`);
    }

    return entities;
  }
}
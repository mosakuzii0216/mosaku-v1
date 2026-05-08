import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ERROR_CODES, throwForbidden } from '../exceptions';
import type { MaybeAuthRequest } from '../../auth/types';

/**
 * ADMIN ロールを持つユーザーのみアクセスを許可するガード
 *
 * JwtAuthGuard が先に実行され req.user が設定されている前提で動作する。
 * JwtStrategy.validate() が DB からユーザーを取得するため、req.user.role は常に最新の値を持つ。
 */
@Injectable()
export class AdminGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<MaybeAuthRequest>();
		const user = request.user;

		if (!user || user.role !== 'ADMIN') {
			throwForbidden(ERROR_CODES.AUTHZ.ADMIN_ONLY);
		}

		return true;
	}
}

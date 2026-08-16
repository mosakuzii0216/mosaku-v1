import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { isAuthenticatedUser } from './types';
import { ERROR_CODES, throwUnauthorized } from '../common/exceptions';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	constructor(private reflector: Reflector) {
		super();
	}

	canActivate(context: ExecutionContext) {
		// @Public() デコレータがある場合は認証をスキップ
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		]);

		if (isPublic) {
			return true;
		}

		return super.canActivate(context);
	}

	handleRequest<TUser = unknown>(
		err: unknown,
		user: unknown,
		_info: unknown,
		_context: ExecutionContext,
	): TUser {
		if (err) {
			if (err instanceof Error) {
				throw err;
			}
			throwUnauthorized(ERROR_CODES.AUTH.AUTHENTICATION_REQUIRED);
		}

		if (!isAuthenticatedUser(user)) {
			throwUnauthorized(ERROR_CODES.AUTH.AUTHENTICATION_REQUIRED);
		}
		return user as TUser;
	}
}

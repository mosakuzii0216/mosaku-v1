import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { isAuthenticatedUser } from './types';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	constructor(private reflector: Reflector) {
		super();
	}

	canActivate(context: ExecutionContext) {
		// @Public() デコレータがある場合は認証をスキップ
		const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
			context.getHandler(),
			context.getClass(),
		]);

		if (isPublic) {
			return true;
		}

		return super.canActivate(context);
	}

	handleRequest(err: unknown, user: unknown, _info: unknown, _context: ExecutionContext) {
		if (err) {
			if (err instanceof Error) {
				throw err;
			}
			throw new UnauthorizedException('Authentication required');
		}

		if (!isAuthenticatedUser(user)) {
			throw new UnauthorizedException('Authentication required');
		}
		return user;
	}
}

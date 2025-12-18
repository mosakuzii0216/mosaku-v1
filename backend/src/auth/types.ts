import type { Request as ExpressRequest } from 'express';
import type { User } from '@prisma/client';
import type { OAuthStrategyUser } from './types/oauth.types';

export type AuthenticatedUser = Omit<User, 'password'>;
export type UserRole = AuthenticatedUser['role'];

export type JwtUser = Pick<AuthenticatedUser, 'id' | 'email' | 'role'>;

export interface AuthenticatedRequest extends ExpressRequest {
	user: AuthenticatedUser;
}

export interface MaybeAuthRequest extends ExpressRequest {
	user?: AuthenticatedUser;
}

export interface OAuthRequest<TUser extends OAuthStrategyUser = OAuthStrategyUser>
	extends ExpressRequest {
	user: TUser;
}

export const isAuthenticatedUser = (value: unknown): value is AuthenticatedUser => {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const user = value as { id?: unknown; email?: unknown; role?: unknown };
	return typeof user.id === 'string' && typeof user.email === 'string' && typeof user.role === 'string';
};

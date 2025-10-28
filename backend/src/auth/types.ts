import type { Request as ExpressRequest } from 'express';

export type UserRole = 'FREE' | 'PREMIUM' | 'ADMIN';

export interface JwtUser {
	id: string;
	email: string;
	role: UserRole;
}

export interface AuthenticatedRequest extends ExpressRequest {
	user: JwtUser;
}

export interface MaybeAuthRequest extends ExpressRequest {
	user?: JwtUser;
}

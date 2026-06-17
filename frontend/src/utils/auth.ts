import { getBackendUrl } from './env';
import { logger } from './logger';

export interface UserProfile {
	id: string;
	email: string;
	name: string | null;
	role: 'USER' | 'ADMIN';
	createdAt: string;
	updatedAt: string;
}

export interface AuthTokens {
	accessToken: string;
}

export interface LoginResponse {
	message: string;
	accessToken: string;
	user: UserProfile;
}

export interface RegisterResponse {
	message: string;
	user: UserProfile;
}

export interface OAuthUserData {
	oauthId?: string;
	email?: string;
	name: string;
	picture?: string;
}

export interface TokenPayload {
	sub: string;
	email: string;
	name: string;
	role: 'USER' | 'ADMIN';
	iat: number;
	exp: number;
}

class AuthTokenManager {
	private static readonly ACCESS_TOKEN_KEY = 'auth_access_token';

	static getAccessToken(): string | null {
		return localStorage.getItem(this.ACCESS_TOKEN_KEY);
	}

	static setAccessToken(token: string): void {
		localStorage.setItem(this.ACCESS_TOKEN_KEY, token);
	}

	static removeTokens(): void {
		localStorage.removeItem(this.ACCESS_TOKEN_KEY);
	}

	static isTokenExpired(token: string): boolean {
		try {
			const payload = JSON.parse(atob(token.split('.')[1]));
			const exp = payload.exp * 1000; // Convert to milliseconds
			return Date.now() >= exp;
		} catch {
			return true; // If parsing fails, consider token expired
		}
	}

	static getTokenPayload(token: string): TokenPayload | null {
		try {
			return JSON.parse(atob(token.split('.')[1])) as TokenPayload;
		} catch {
			return null;
		}
	}

	static isAuthenticated(): boolean {
		const token = this.getAccessToken();
		if (!token) return false;
		return !this.isTokenExpired(token);
	}
}

export class AuthAPI {
	private static readonly BASE_URL = getBackendUrl();

	private static async makeRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
		const token = AuthTokenManager.getAccessToken();
		const headers = new Headers(options.headers);

		headers.set('Content-Type', 'application/json');

		if (token && !AuthTokenManager.isTokenExpired(token)) {
			headers.set('Authorization', `Bearer ${token}`);
		}

		return fetch(`${this.BASE_URL}${endpoint}`, {
			...options,
			// クロスオリジン（frontend ↔ api.mosaku.jp）で Refresh Token Cookie を
			// 保存・送信するために必須。これがないとログイン時の Set-Cookie が破棄される。
			credentials: 'include',
			headers,
		});
	}

	static async login(email: string, password: string): Promise<LoginResponse> {
		const response = await this.makeRequest('/auth/login', {
			method: 'POST',
			body: JSON.stringify({ email, password }),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Login failed');
		}

		const data = await response.json();
		AuthTokenManager.setAccessToken(data.accessToken);
		return data;
	}

	static async register(
		email: string,
		password: string,
		name?: string,
		invitationCode?: string,
	): Promise<RegisterResponse> {
		const response = await this.makeRequest('/auth/register', {
			method: 'POST',
			body: JSON.stringify({ email, password, name, invitationCode }),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Registration failed');
		}

		return response.json();
	}

	static async logout(): Promise<void> {
		try {
			await this.makeRequest('/auth/logout', { method: 'POST' });
		} catch (error) {
			logger.error('Logout API call failed:', error);
		} finally {
			AuthTokenManager.removeTokens();
		}
	}

	static async getCurrentUser(): Promise<UserProfile> {
		const response = await this.makeRequest('/auth/me');

		if (!response.ok) {
			if (response.status === 401) {
				AuthTokenManager.removeTokens();
				throw new Error('Authentication required');
			}
			const error = await response.json();
			throw new Error(error.message || 'Failed to get user profile');
		}

		return response.json();
	}

	static async resetPassword(email: string): Promise<{ message: string }> {
		const response = await this.makeRequest('/auth/reset-password', {
			method: 'POST',
			body: JSON.stringify({ email }),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to send password reset email');
		}

		return response.json();
	}

	static async confirmPasswordReset(
		token: string,
		newPassword: string,
	): Promise<{ message: string }> {
		const response = await this.makeRequest('/auth/reset-password/confirm', {
			method: 'POST',
			body: JSON.stringify({ token, newPassword }),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to reset password');
		}

		return response.json();
	}

	static async changePassword(
		currentPassword: string,
		newPassword: string,
	): Promise<{ message: string }> {
		const response = await this.makeRequest('/auth/change-password', {
			method: 'POST',
			body: JSON.stringify({ currentPassword, newPassword }),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to change password');
		}

		return response.json();
	}
}

export { AuthTokenManager };

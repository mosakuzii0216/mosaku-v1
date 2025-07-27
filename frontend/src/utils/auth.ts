// JWT Token Management Utilities

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: 'FREE' | 'PREMIUM' | 'ADMIN';
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

  static getTokenPayload(token: string): any {
    try {
      return JSON.parse(atob(token.split('.')[1]));
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

// API Call Helper with Authentication
export class AuthAPI {
  private static readonly BASE_URL = 'http://localhost/api';

  private static async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = AuthTokenManager.getAccessToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token && !AuthTokenManager.isTokenExpired(token)) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(`${this.BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  }

  static async login(email: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${this.BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
    invitationCode?: string
  ): Promise<RegisterResponse> {
    const response = await fetch(`${this.BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
      console.error('Logout API call failed:', error);
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
    const response = await fetch(`${this.BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to send password reset email');
    }

    return response.json();
  }

  static async changePassword(
    currentPassword: string,
    newPassword: string
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

  static async googleRegisterWithInvitation(
    googleUser: any,
    invitationCode: string
  ): Promise<LoginResponse> {
    const response = await fetch(`${this.BASE_URL}/auth/google/register-with-invitation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ googleUser, invitationCode }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Google registration failed');
    }

    const data = await response.json();
    AuthTokenManager.setAccessToken(data.accessToken);
    return data;
  }

  static async githubRegisterWithInvitation(
    githubUser: any,
    invitationCode: string
  ): Promise<LoginResponse> {
    const response = await fetch(`${this.BASE_URL}/auth/github/register-with-invitation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ githubUser, invitationCode }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'GitHub registration failed');
    }

    const data = await response.json();
    AuthTokenManager.setAccessToken(data.accessToken);
    return data;
  }
}

export { AuthTokenManager };
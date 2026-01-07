import type { Memo, CreateMemoDto, UpdateMemoDto } from '../types/memo';
import type {
	Tag,
	CreateTagDto,
	UpdateTagDto,
	AssignTagsDto,
	MemoTag,
	NotebookTag,
} from '../types/tag';
import type { Theme, ThemeSearchParams, CreateThemeData, UpdateThemeData } from '../types/theme';
import type { Notebook, CreateNotebookDto, UpdateNotebookDto } from '../types/notebook';
import { AuthTokenManager } from './auth';
import { getBackendUrl } from './env';

const API_BASE_URL = getBackendUrl();

type AuthLevel = 'REQUIRED' | 'OPTIONAL' | 'NONE';

interface RequestConfig extends RequestInit {
	authLevel?: AuthLevel;
}

class ApiClient {
	private getAuthHeaders(authLevel: AuthLevel): Record<string, string> {
		if (authLevel === 'NONE') {
			return {};
		}

		const token = AuthTokenManager.getAccessToken();

		if (!token || AuthTokenManager.isTokenExpired(token)) {
			if (authLevel === 'REQUIRED') {
				throw new Error('認証が必要です');
			}
			return {};
		}

		return {
			Authorization: `Bearer ${token}`,
		};
	}

	private async request<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
		const { authLevel = 'REQUIRED', ...fetchConfig } = config;
		const url = `${API_BASE_URL}${endpoint}`;

		const authHeaders = this.getAuthHeaders(authLevel);

		const finalConfig: RequestInit = {
			headers: {
				'Content-Type': 'application/json',
				...authHeaders,
				...fetchConfig.headers,
			},
			...fetchConfig,
		};

		let response: Response;
		try {
			response = await fetch(url, finalConfig);
		} catch (networkError) {
			const message = networkError instanceof Error ? networkError.message : String(networkError);
			throw new Error(`ネットワークエラー: ${message}`);
		}

		if (!response.ok) {
			if (response.status === 401 && authLevel === 'REQUIRED') {
				throw new Error('認証エラー: ログインし直してください');
			}
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		return response.json();
	}

	// 後方互換性のためのヘルパーメソッド（将来的に削除予定）
	private async requestPublic<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
		return this.request<T>(endpoint, { ...options, authLevel: 'NONE' });
	}

	private async requestWithOptionalAuth<T>(
		endpoint: string,
		options: RequestInit = {},
	): Promise<T> {
		return this.request<T>(endpoint, { ...options, authLevel: 'OPTIONAL' });
	}

	// メモ一覧取得
	async getMemos(tagIds?: string[]): Promise<Memo[]> {
		const params = new URLSearchParams();
		if (tagIds && tagIds.length > 0) {
			tagIds.forEach((tagId) => params.append('tagIds', tagId));
		}
		const queryString = params.toString();
		return this.request<Memo[]>(`/memos${queryString ? `?${queryString}` : ''}`);
	}

	// 特定メモ取得
	async getMemo(id: string): Promise<Memo> {
		return this.request<Memo>(`/memos/${id}`);
	}

	// メモ作成
	async createMemo(data: CreateMemoDto): Promise<Memo> {
		return this.request<Memo>('/memos', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	// メモ更新
	async updateMemo(id: string, data: UpdateMemoDto): Promise<Memo> {
		return this.request<Memo>(`/memos/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(data),
		});
	}

	// メモ削除
	async deleteMemo(id: string): Promise<void> {
		await this.request(`/memos/${id}`, {
			method: 'DELETE',
		});
	}

	// メモ検索
	async searchMemos(query: string, tagIds?: string[]): Promise<Memo[]> {
		const params = new URLSearchParams();
		if (query) {
			params.append('q', query);
		}
		if (tagIds && tagIds.length > 0) {
			tagIds.forEach((tagId) => params.append('tagIds', tagId));
		}
		return this.request<Memo[]>(`/memos/search?${params.toString()}`);
	}

	// タグ一覧取得
	async getTags(): Promise<Tag[]> {
		return this.request<Tag[]>('/tags');
	}

	// 特定タグ取得
	async getTag(id: string): Promise<Tag> {
		return this.request<Tag>(`/tags/${id}`);
	}

	// タグ作成
	async createTag(data: CreateTagDto): Promise<Tag> {
		return this.request<Tag>('/tags', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	// タグ更新
	async updateTag(id: string, data: UpdateTagDto): Promise<Tag> {
		return this.request<Tag>(`/tags/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(data),
		});
	}

	// タグ削除
	async deleteTag(id: string): Promise<void> {
		await this.request(`/tags/${id}`, {
			method: 'DELETE',
		});
	}

	// タグ検索
	async searchTags(query: string): Promise<Tag[]> {
		const params = new URLSearchParams();
		if (query) {
			params.append('q', query);
		}
		return this.request<Tag[]>(`/tags/search?${params.toString()}`);
	}

	// メモにタグを割り当て
	async assignTagsToMemo(memoId: string, data: AssignTagsDto): Promise<Memo> {
		return this.request<Memo>(`/tags/memo/${memoId}/assign`, {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	// メモのタグ取得
	async getMemoTags(memoId: string): Promise<MemoTag[]> {
		return this.request<MemoTag[]>(`/tags/memo/${memoId}`);
	}

	// ノートブックにタグを割り当て
	async assignTagsToNotebook(notebookId: string, data: AssignTagsDto): Promise<any> {
		return this.request<any>(`/tags/notebook/${notebookId}/assign`, {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	// ノートブックのタグ取得
	async getNotebookTags(notebookId: string): Promise<NotebookTag[]> {
		return this.request<NotebookTag[]>(`/tags/notebook/${notebookId}`);
	}

	// 招待コード検証（認証不要）
	async verifyInvitationCode(code: string): Promise<any> {
		const url = `${API_BASE_URL}/invitation/verify`;

		const config: RequestInit = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ code }),
		};

		const response = await fetch(url, config);

		if (!response.ok) {
			let errorMessage = 'Invalid invitation code';
			try {
				const contentType = response.headers.get('content-type');
				if (contentType && contentType.includes('application/json')) {
					const error = await response.json();
					errorMessage = error.message || errorMessage;
				} else {
					errorMessage = `API Error: ${response.status} ${response.statusText}`;
				}
			} catch {
				errorMessage = `Network Error: ${response.status} ${response.statusText}`;
			}
			throw new Error(errorMessage);
		}

		return response.json();
	}

	// ========== テーマ関連API ==========

	// テーマ一覧取得（検索・フィルタリング対応）
	async getThemes(params?: ThemeSearchParams): Promise<Theme[]> {
		const searchParams = new URLSearchParams();
		if (params?.query) searchParams.append('query', params.query);
		if (params?.category) searchParams.append('category', params.category);
		if (params?.isSystem !== undefined) searchParams.append('isSystem', params.isSystem.toString());
		if (params?.isPublic !== undefined) searchParams.append('isPublic', params.isPublic.toString());
		if (params?.favoritesOnly !== undefined)
			searchParams.append('favoritesOnly', params.favoritesOnly.toString());

		const queryString = searchParams.toString();
		return this.requestWithOptionalAuth<Theme[]>(`/theme${queryString ? `?${queryString}` : ''}`);
	}

	// システムテーマ一覧取得（認証不要）
	async getSystemThemes(): Promise<Theme[]> {
		return this.requestPublic<Theme[]>('/theme/system/list');
	}

	// 公開テーマ一覧取得（認証不要）
	async getPublicThemes(): Promise<Theme[]> {
		return this.requestWithOptionalAuth<Theme[]>('/theme/public/list');
	}

	// カテゴリ別テーマ一覧取得
	async getThemesByCategory(category: string): Promise<Theme[]> {
		return this.requestWithOptionalAuth<Theme[]>(`/theme/category/${category}`);
	}

	// 特定テーマ取得
	async getTheme(id: string): Promise<Theme> {
		return this.requestWithOptionalAuth<Theme>(`/theme/${id}`);
	}

	// テーマ作成（管理者のみ）
	async createTheme(data: CreateThemeData): Promise<Theme> {
		return this.request<Theme>('/theme', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	// テーマ更新（管理者のみ）
	async updateTheme(id: string, data: UpdateThemeData): Promise<Theme> {
		return this.request<Theme>(`/theme/${id}`, {
			method: 'PUT',
			body: JSON.stringify(data),
		});
	}

	// テーマ削除（管理者のみ）
	async deleteTheme(id: string): Promise<void> {
		await this.request(`/theme/${id}`, {
			method: 'DELETE',
		});
	}

	// テーマをお気に入りに追加
	async addToFavoriteThemes(themeId: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/theme/${themeId}/favorite`, {
			method: 'POST',
		});
	}

	// テーマをお気に入りから削除
	async removeFromFavoriteThemes(themeId: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/theme/${themeId}/favorite`, {
			method: 'DELETE',
		});
	}

	// ユーザーのお気に入りテーマ一覧取得
	async getFavoriteThemes(): Promise<Theme[]> {
		return this.request<Theme[]>('/theme/favorites/me');
	}

	private normalizeNotebook(raw: any): Notebook {
		return {
			id: raw.id,
			name: raw.name ?? null, // 後方互換: name優先
			content: raw.content ?? null,
			createdAt: raw.createdAt,
			updatedAt: raw.updatedAt,
			themeId: raw.themeId ?? null,
			theme: raw.theme ?? null,
		};
	}

	async getNotebooks(): Promise<Notebook[]> {
		const res = await this.request<any[]>('/notebooks');
		return res.map((r) => this.normalizeNotebook(r));
	}

	async getNotebook(id: string): Promise<Notebook> {
		const res = await this.request<any>(`/notebooks/${id}`);
		return this.normalizeNotebook(res);
	}

	async createNotebook(data: CreateNotebookDto): Promise<Notebook> {
		const res = await this.request<any>('/notebooks', {
			method: 'POST',
			body: JSON.stringify(data),
		});
		return this.normalizeNotebook(res);
	}

	async updateNotebook(id: string, data: UpdateNotebookDto): Promise<Notebook> {
		const res = await this.request<any>(`/notebooks/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(data),
		});
		return this.normalizeNotebook(res);
	}

	async deleteNotebook(id: string): Promise<void> {
		await this.request(`/notebooks/${id}`, { method: 'DELETE' });
	}
}

export const apiClient = new ApiClient();

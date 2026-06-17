import type {
	Memo,
	CreateMemoDto,
	UpdateMemoDto,
	PublishMemoResponseDto,
	PublicMemoListItemDto,
	PublicMemoResponseDto,
} from '../types/memo';
import type { SubmitFeedbackDto } from '../types/feedback';
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
import type {
	InvitationVerificationResponse,
	InvitationCode,
	CreateInvitationDto,
	InvitationContextResponse,
	InvitationWithShareUrlResponse,
	UserQuotaResponse,
	InvitationOAuthProvider,
	OAuthStartResponse,
} from '../types/invitation';
import type { PaginationParams, PaginatedResult } from '../types/pagination';
import type {
	RecentMemoDto,
	WeeklyCountDto,
	ActivityDatesDto,
	NotebookWithMemoCountDto,
} from '../types/dashboard';
import { AuthTokenManager } from './auth';
import { getBackendUrl } from './env';
import { refreshClient } from './refreshClient';
import { ApiError } from './apiError';

const API_BASE_URL = getBackendUrl();

type AuthLevel = 'REQUIRED' | 'OPTIONAL' | 'NONE';

interface RequestConfig extends RequestInit {
	authLevel?: AuthLevel;
	_retried?: boolean;
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
		const { authLevel = 'REQUIRED', _retried = false, ...fetchConfig } = config;
		const url = `${API_BASE_URL}${endpoint}`;

		// アクセストークンがローカルで期限切れ／不在でも、Refresh Token Cookie は
		// 長寿命なため先回りでリフレッシュを試みる。これをしないと getAuthHeaders が
		// fetch 前に同期 throw し、401 時の透過リフレッシュ経路へ到達できない
		// （放置後にメモ一覧を開くと「認証が必要です」になる原因）。
		if (authLevel === 'REQUIRED' && !_retried) {
			const token = AuthTokenManager.getAccessToken();
			if (!token || AuthTokenManager.isTokenExpired(token)) {
				try {
					await refreshClient.ensureRefreshed();
				} catch {
					throw new Error('認証エラー: ログインし直してください');
				}
				return this.request<T>(endpoint, { ...config, _retried: true });
			}
		}

		const authHeaders = this.getAuthHeaders(authLevel);

		const finalConfig: RequestInit = {
			...fetchConfig,
			// クロスオリジン構成で Cookie（Refresh Token 等）を送受信するために必須
			credentials: 'include',
			headers: {
				'Content-Type': 'application/json',
				...authHeaders,
				...fetchConfig.headers,
			},
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
				if (!_retried) {
					try {
						await refreshClient.ensureRefreshed();
						return this.request<T>(endpoint, { ...config, _retried: true });
					} catch {
						throw new Error('認証エラー: ログインし直してください');
					}
				}
				throw new Error('認証エラー: ログインし直してください');
			}

			let errorMessage = `HTTP error! status: ${response.status}`;
			let errorCode: string | null = null;
			const contentType = response.headers.get('content-type');
			if (contentType && contentType.includes('application/json')) {
				try {
					const errorBody = await response.json();
					if (errorBody.message) {
						errorMessage = errorBody.message;
					}
					if (typeof errorBody.code === 'string') {
						errorCode = errorBody.code;
					}
				} catch {
					// JSON パース失敗時はフォールバックメッセージを使用
				}
			}

			if (errorCode) {
				throw new ApiError({
					code: errorCode,
					message: errorMessage,
					statusCode: response.status,
				});
			}
			throw new Error(errorMessage);
		}

		const contentType = response.headers.get('content-type');
		if (!contentType?.includes('application/json')) {
			return undefined as T;
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

	// メモ更新（clientUpdatedAt を含めると last-write-wins チェックの対象になる）
	async updateMemo(id: string, data: UpdateMemoDto & { clientUpdatedAt?: string }): Promise<Memo> {
		return this.request<Memo>(`/memos/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(data),
		});
	}

	// メモ削除（soft delete: ゴミ箱に移動）
	async deleteMemo(id: string): Promise<Memo> {
		return this.request<Memo>(`/memos/${id}`, {
			method: 'DELETE',
		});
	}

	// ゴミ箱内メモ一覧取得
	async getTrashMemos(): Promise<Memo[]> {
		return this.request<Memo[]>('/memos/trash');
	}

	// ゴミ箱内メモを復元する
	async restoreMemo(id: string): Promise<Memo> {
		return this.request<Memo>(`/memos/${id}/restore`, {
			method: 'PATCH',
		});
	}

	// ゴミ箱内メモを完全削除する
	async permanentDeleteMemo(id: string): Promise<Memo> {
		return this.request<Memo>(`/memos/${id}/permanent`, {
			method: 'DELETE',
		});
	}

	// ゴミ箱を空にする
	async emptyTrash(): Promise<{ count: number }> {
		return this.request<{ count: number }>('/memos/trash', {
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

	// メモ一覧取得（ページネーション対応）
	async getMemosPaginated(
		pagination?: PaginationParams,
		tagIds?: string[],
	): Promise<PaginatedResult<Memo>> {
		const params = new URLSearchParams();
		if (pagination?.page) params.append('page', pagination.page.toString());
		if (pagination?.limit) params.append('limit', pagination.limit.toString());
		if (tagIds && tagIds.length > 0) {
			tagIds.forEach((tagId) => params.append('tagIds', tagId));
		}
		const queryString = params.toString();
		return this.request<PaginatedResult<Memo>>(
			`/memos/paginated${queryString ? `?${queryString}` : ''}`,
		);
	}

	// メモ検索（ページネーション対応）
	async searchMemosPaginated(
		query: string,
		pagination?: PaginationParams,
		tagIds?: string[],
	): Promise<PaginatedResult<Memo>> {
		const params = new URLSearchParams();
		if (query) params.append('q', query);
		if (pagination?.page) params.append('page', pagination.page.toString());
		if (pagination?.limit) params.append('limit', pagination.limit.toString());
		if (tagIds && tagIds.length > 0) {
			tagIds.forEach((tagId) => params.append('tagIds', tagId));
		}
		return this.request<PaginatedResult<Memo>>(`/memos/search/paginated?${params.toString()}`);
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
	async assignTagsToNotebook(notebookId: string, data: AssignTagsDto): Promise<Notebook> {
		return this.request<Notebook>(`/tags/notebook/${notebookId}/assign`, {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	// ノートブックのタグ取得
	async getNotebookTags(notebookId: string): Promise<NotebookTag[]> {
		return this.request<NotebookTag[]>(`/tags/notebook/${notebookId}`);
	}

	// 招待コード検証（認証不要）
	async verifyInvitationCode(code: string): Promise<InvitationVerificationResponse> {
		return this.requestPublic<InvitationVerificationResponse>('/invitation/verify', {
			method: 'POST',
			body: JSON.stringify({ code }),
		});
	}

	// 招待コード一覧取得（ADMIN専用）
	async getInvitations(): Promise<InvitationCode[]> {
		return this.request<InvitationCode[]>('/invitation');
	}

	// 招待コード作成（ADMIN専用）
	async createInvitation(data: CreateInvitationDto): Promise<InvitationCode> {
		return this.request<InvitationCode>('/invitation', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	// 招待コード削除（ADMIN専用）
	async deleteInvitation(id: string): Promise<void> {
		await this.request(`/invitation/${id}`, { method: 'DELETE' });
	}

	// 招待コード文脈検証（受信者向け、認証不要）
	async verifyInvitationContext(input: { code: string }): Promise<InvitationContextResponse> {
		return this.requestPublic<InvitationContextResponse>('/invitation/verify-context', {
			method: 'POST',
			body: JSON.stringify({ code: input.code }),
		});
	}

	// 自分の招待コードを発行
	async createMyInvitation(): Promise<InvitationWithShareUrlResponse> {
		return this.request<InvitationWithShareUrlResponse>('/invitation/me', {
			method: 'POST',
		});
	}

	// 自分の招待コード一覧
	async getMyInvitations(): Promise<InvitationWithShareUrlResponse[]> {
		return this.request<InvitationWithShareUrlResponse[]>('/invitation/me');
	}

	// 自分の招待 quota 残数
	async getMyInvitationQuota(): Promise<UserQuotaResponse> {
		return this.request<UserQuotaResponse>('/invitation/me/quota');
	}

	// 自分の招待コードを削除
	async deleteMyInvitation(input: { id: string }): Promise<void> {
		await this.request(`/invitation/me/${input.id}`, { method: 'DELETE' });
	}

	// OAuth 登録開始（招待コードを開始前に検証 → state 経由でコールバックへ）
	async startOAuthRegistration(input: {
		provider: InvitationOAuthProvider;
		invitationCode: string;
	}): Promise<OAuthStartResponse> {
		return this.requestPublic<OAuthStartResponse>(`/auth/oauth/${input.provider}/start`, {
			method: 'POST',
			body: JSON.stringify({ invitationCode: input.invitationCode }),
		});
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

	private normalizeNotebook(raw: Notebook): Notebook {
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
		const res = await this.request<Notebook[]>('/notebooks');
		return res.map((r) => this.normalizeNotebook(r));
	}

	async getNotebook(id: string): Promise<Notebook> {
		const res = await this.request<Notebook>(`/notebooks/${id}`);
		return this.normalizeNotebook(res);
	}

	async createNotebook(data: CreateNotebookDto): Promise<Notebook> {
		const res = await this.request<Notebook>('/notebooks', {
			method: 'POST',
			body: JSON.stringify(data),
		});
		return this.normalizeNotebook(res);
	}

	async updateNotebook(id: string, data: UpdateNotebookDto): Promise<Notebook> {
		const res = await this.request<Notebook>(`/notebooks/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(data),
		});
		return this.normalizeNotebook(res);
	}

	async deleteNotebook(id: string): Promise<void> {
		await this.request(`/notebooks/${id}`, { method: 'DELETE' });
	}

	// ヘルスチェック（オフライン状態判定用 heartbeat。認証不要）
	async health(): Promise<{ status: string }> {
		return this.request<{ status: string }>('/health', { authLevel: 'NONE' });
	}

	// ========== メモ公開系API ==========

	// メモを公開する（所有者向け）
	async publishMemo(id: string): Promise<PublishMemoResponseDto> {
		return this.request<PublishMemoResponseDto>(`/memos/${id}/share`, {
			method: 'POST',
		});
	}

	// メモを非公開にする（所有者向け）
	async unpublishMemo(id: string): Promise<{ success: boolean }> {
		return this.request<{ success: boolean }>(`/memos/${id}/share`, {
			method: 'DELETE',
		});
	}

	// 公開トークンを再生成する（所有者向け）
	async regenerateMemoToken(id: string): Promise<PublishMemoResponseDto> {
		return this.request<PublishMemoResponseDto>(`/memos/${id}/share/regenerate`, {
			method: 'POST',
		});
	}

	// 自分の公開中メモ一覧を取得する（所有者向け）
	async getMyPublicMemos(): Promise<PublicMemoListItemDto[]> {
		return this.request<PublicMemoListItemDto[]>('/memos/me/public-memos');
	}

	// 公開トークンでメモを取得する（未ログイン閲覧者向け、認証不要）
	async getPublicMemo(token: string): Promise<PublicMemoResponseDto> {
		return this.requestPublic<PublicMemoResponseDto>(`/memos/public/${token}`);
	}

	// フィードバック送信（ログイン済みユーザー専用）
	async submitFeedback(dto: SubmitFeedbackDto): Promise<void> {
		await this.request('/feedback', {
			method: 'POST',
			body: JSON.stringify(dto),
		});
	}

	// ========== ダッシュボード関連API ==========

	async getDashboardRecentMemos(): Promise<RecentMemoDto[]> {
		return this.request<RecentMemoDto[]>('/dashboard/recent-memos');
	}

	async getDashboardWeeklyCount(): Promise<WeeklyCountDto> {
		return this.request<WeeklyCountDto>('/dashboard/weekly-count');
	}

	async getDashboardActivityDates(from: string, to: string): Promise<ActivityDatesDto> {
		const params = new URLSearchParams({ from, to });
		return this.request<ActivityDatesDto>(`/dashboard/activity-dates?${params.toString()}`);
	}

	async getDashboardNotebooks(): Promise<NotebookWithMemoCountDto[]> {
		return this.request<NotebookWithMemoCountDto[]>('/dashboard/notebooks');
	}
}

export const apiClient = new ApiClient();

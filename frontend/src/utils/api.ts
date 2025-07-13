import type { Memo, CreateMemoDto, UpdateMemoDto } from '../types/memo';
import type { Tag, CreateTagDto, UpdateTagDto, AssignTagsDto, MemoTag } from '../types/tag';
import { supabase } from '../lib/supabase';

const API_BASE_URL = 'http://localhost/api';

class ApiClient {
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('認証が必要です');
    }
    
    return {
      'Authorization': `Bearer ${session.access_token}`,
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const authHeaders = await this.getAuthHeaders();
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
      },
      ...options,
    };

    let response: Response;
    try {
      response = await fetch(url, config);
    } catch (networkError) {
      throw new Error(`ネットワークエラー: ${networkError.message}`);
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('認証エラー: ログインし直してください');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // メモ一覧取得
  async getMemos(tagIds?: string[]): Promise<Memo[]> {
    const params = new URLSearchParams();
    if (tagIds && tagIds.length > 0) {
      tagIds.forEach(tagId => params.append('tagIds', tagId));
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
      tagIds.forEach(tagId => params.append('tagIds', tagId));
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
      } catch (parseError) {
        errorMessage = `Network Error: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }
}

export const apiClient = new ApiClient();

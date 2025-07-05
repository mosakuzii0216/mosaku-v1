import type { Memo, CreateMemoDto, UpdateMemoDto } from '../types/memo';
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

    const response = await fetch(url, config);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('認証エラー: ログインし直してください');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // メモ一覧取得
  async getMemos(): Promise<Memo[]> {
    return this.request<Memo[]>('/memos');
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
  async searchMemos(query: string): Promise<Memo[]> {
    const params = new URLSearchParams();
    if (query) {
      params.append('q', query);
    }
    return this.request<Memo[]>(`/memos/search?${params.toString()}`);
  }
}

export const apiClient = new ApiClient();

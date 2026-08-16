/**
 * E2E 用のバックエンド API ヘルパー。
 *
 * このヘルパーは Playwright テストから直接バックエンドへ HTTP リクエストを送り、
 * テスト用ユーザーの登録 / ログイン、メモの seed、ゴミ箱クリアを行う。
 *
 * Playwright の `request` フィクスチャに依存しない（Node fetch のみ）ことで、
 * `globalSetup` などコンテキスト外の場所からも呼べる構造にしている。
 */

import { generateJSON } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import { TaskList, TaskItem } from '@tiptap/extension-list';

/**
 * seed 用の最小拡張セット。
 * アプリ本体の createEditorExtensions は CSS をimport しており Node から読まないため、
 * ここでは CSS を引かない tiptap パッケージだけで schema を組む。
 */
const seedExtensions = [StarterKit, TaskList, TaskItem];

export interface BackendUser {
	id: string;
	email: string;
	name: string;
	role: 'USER' | 'ADMIN';
}

export interface LoginResult {
	accessToken: string;
	refreshToken: string;
	user: BackendUser;
}

export interface SeededMemo {
	id: string;
	title: string;
	content: string;
	createdAt: string;
	updatedAt: string;
}

export interface PublishMemoResult {
	memoId: string;
	publicToken: string;
	publishedAt: string;
}

export interface BackendApiOptions {
	baseUrl: string;
}

export class BackendApi {
	private readonly baseUrl: string;

	constructor(opts: BackendApiOptions) {
		this.baseUrl = opts.baseUrl.replace(/\/$/, '');
	}

	private async request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
		if (init.headers) Object.assign(headers, init.headers as Record<string, string>);

		const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
		if (!res.ok) {
			const text = await res.text().catch(() => '');
			throw new Error(`Backend ${init.method ?? 'GET'} ${path} failed (${res.status}): ${text}`);
		}
		// no-content
		if (res.status === 204) return undefined as unknown as T;
		return (await res.json()) as T;
	}

	async ensureUser(email: string, password: string, name: string): Promise<void> {
		// register は既存ユーザーで失敗するが、その場合はそのまま進める
		try {
			await this.request<{ message: string }>('/auth/register', {
				method: 'POST',
				body: JSON.stringify({ email, password, name }),
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (!/already.*exist|409|400/i.test(msg)) throw err;
		}
	}

	async login(email: string, password: string): Promise<LoginResult> {
		const result = await this.request<{ message: string } & LoginResult>('/auth/login', {
			method: 'POST',
			body: JSON.stringify({ email, password }),
		});
		return {
			accessToken: result.accessToken,
			refreshToken: result.refreshToken,
			user: result.user,
		};
	}

	async createMemo(
		accessToken: string,
		input: { title: string; content: string; notebookId?: string },
	): Promise<SeededMemo> {
		// backend は content-jsonb 移行済みで ProseMirror doc を要求する。
		// 各 spec は HTML 文字列で seed するため、境界であるここで変換する。
		const body = { ...input, content: generateJSON(input.content, seedExtensions) };
		return this.request<SeededMemo>(
			'/memos',
			{ method: 'POST', body: JSON.stringify(body) },
			accessToken,
		);
	}

	async listMemos(accessToken: string): Promise<SeededMemo[]> {
		return this.request<SeededMemo[]>('/memos', { method: 'GET' }, accessToken);
	}

	async getMemo(accessToken: string, id: string): Promise<SeededMemo> {
		return this.request<SeededMemo>(`/memos/${id}`, { method: 'GET' }, accessToken);
	}

	async trashMemo(accessToken: string, id: string): Promise<void> {
		await this.request<unknown>(`/memos/${id}`, { method: 'DELETE' }, accessToken);
	}

	async permanentDelete(accessToken: string, id: string): Promise<void> {
		await this.request<unknown>(`/memos/${id}/permanent`, { method: 'DELETE' }, accessToken);
	}

	async emptyTrash(accessToken: string): Promise<void> {
		await this.request<unknown>('/memos/trash', { method: 'DELETE' }, accessToken);
	}

	async resetUserMemos(accessToken: string): Promise<void> {
		const memos = await this.listMemos(accessToken);
		for (const memo of memos) {
			await this.trashMemo(accessToken, memo.id).catch(() => {});
		}
		await this.emptyTrash(accessToken).catch(() => {});
	}

	async publishMemo(accessToken: string, id: string): Promise<PublishMemoResult> {
		return this.request<PublishMemoResult>(`/memos/${id}/share`, { method: 'POST' }, accessToken);
	}

	async unpublishMemo(accessToken: string, id: string): Promise<void> {
		await this.request<unknown>(`/memos/${id}/share`, { method: 'DELETE' }, accessToken);
	}

	async getPublicMemo(
		token: string,
	): Promise<{ title: string; content: string; updatedAt: string }> {
		return this.request<{ title: string; content: string; updatedAt: string }>(
			`/memos/public/${token}`,
		);
	}
}

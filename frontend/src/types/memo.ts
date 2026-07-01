import type { MemoTag } from './tag';
import type { Theme } from './theme';
import type { Notebook } from './notebook';

export interface Memo {
	id: string;
	title: string;
	content: string;
	createdAt: string;
	updatedAt: string;
	trashedAt: string | null;
	memoTags?: MemoTag[];
	// ノートブック関連
	notebookId?: string | null;
	notebook?:
		| (Pick<Notebook, 'id' | 'name'> & {
				theme?: Pick<Theme, 'id' | 'name' | 'styles' | 'cssFilePath' | 'metadata'> | null;
		  })
		| null;
	// 公開共有関連
	publicToken?: string | null;
	publishedAt?: string | null;
}

export interface CreateMemoDto {
	title: string;
	content: string;
	notebookId?: string | null;
}

export interface UpdateMemoDto {
	title?: string;
	content?: string;
	notebookId?: string | null;
}

export type ViewType = 'list' | 'detail' | 'edit' | 'create' | 'tags' | 'trash';

export type ObjectType = 'memo' | 'notebook' | 'tag' | 'theme' | 'home';

export interface PublishMemoResponseDto {
	memoId: string;
	publicToken: string;
	publishedAt: string;
}

export interface PublicMemoListItemDto {
	memoId: string;
	title: string;
	publicToken: string;
	publishedAt: string;
	updatedAt: string;
}

export interface PublicMemoResponseDto {
	title: string;
	content: string;
	updatedAt: string;
}

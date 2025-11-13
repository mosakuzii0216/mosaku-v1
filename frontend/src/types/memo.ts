import type { MemoTag } from './tag';
import type { Theme } from './theme';
import type { Notebook } from './notebook';

export interface Memo {
	id: string;
	title: string;
	content: string;
	createdAt: string;
	updatedAt: string;
	memoTags?: MemoTag[];
	// ノートブック関連
	notebookId?: string | null;
	notebook?: Pick<Notebook, 'id' | 'name'> & {
		theme?: Pick<Theme, 'id' | 'name' | 'styles' | 'cssFilePath'> | null;
	} | null;
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

export type ViewType = 'list' | 'detail' | 'edit' | 'create' | 'tags';

export type ObjectType = 'memo' | 'notebook' | 'tag' | 'theme';

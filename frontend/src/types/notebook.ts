import type { JSONContent } from '@tiptap/react';
import type { Theme } from './theme';

export interface Notebook {
	id: string;
	name: string | null;
	content?: JSONContent | null;
	createdAt: string;
	updatedAt: string;
	themeId?: string | null;
	theme?: Pick<Theme, 'id' | 'name' | 'styles' | 'cssFilePath' | 'metadata'> | null;
}

export interface CreateNotebookDto {
	name?: string | null;
	themeId?: string | null;
	content?: JSONContent | null;
}

export interface UpdateNotebookDto {
	name?: string | null;
	themeId?: string | null;
	content?: JSONContent | null;
}

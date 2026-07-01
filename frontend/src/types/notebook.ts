import type { Theme } from './theme';

export interface Notebook {
	id: string;
	name: string | null; // ← serverの notebook_name をここへ正規化
	content?: string | null;
	createdAt: string;
	updatedAt: string;
	themeId?: string | null;
	theme?: Pick<Theme, 'id' | 'name' | 'styles' | 'cssFilePath' | 'metadata'> | null;
}

export interface CreateNotebookDto {
	name?: string | null;
	themeId?: string | null;
	content?: string | null;
}

export interface UpdateNotebookDto {
	name?: string | null;
	themeId?: string | null;
	content?: string | null;
}

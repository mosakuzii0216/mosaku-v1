import type { MemoTag } from './tag';
import type { Theme } from './theme';

export interface Memo {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  memoTags?: MemoTag[];
  themeId?: string | null;
  theme?: Pick<Theme, 'id' | 'name' | 'styles'> | null;
}

export interface CreateMemoDto {
  title: string;
  content: string;
  themeId?: string;
}

export interface UpdateMemoDto {
  title?: string;
  content?: string;
  themeId?: string;
}

export type ViewType = 'list' | 'detail' | 'edit' | 'create' | 'tags';

export type ObjectType = 'memo' | 'notebook' | 'tag' | 'theme';

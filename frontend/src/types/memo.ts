export interface Memo {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemoDto {
  title: string;
  content: string;
}

export interface UpdateMemoDto {
  title?: string;
  content?: string;
}

export type ViewType = 'list' | 'detail' | 'edit' | 'create';

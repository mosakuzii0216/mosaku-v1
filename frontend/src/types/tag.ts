export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTagDto {
  name: string;
  color: string;
}

export interface UpdateTagDto {
  name?: string;
  color?: string;
}

export interface MemoTag {
  memoId: string;
  tagId: string;
  tag: Tag;
}

export interface AssignTagsDto {
  tagIds: string[];
}
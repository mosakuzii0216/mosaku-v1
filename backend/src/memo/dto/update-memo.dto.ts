import { IsOptional, MaxLength, IsISO8601, Matches, IsString } from 'class-validator';
import { IsProseMirrorDoc, type ProseMirrorDoc } from '../../common/utils/prosemirror-types';

export class UpdateMemoDto {
	@IsString()
	@IsOptional()
	@MaxLength(100)
	title?: string;

	@IsProseMirrorDoc()
	@IsOptional()
	content?: ProseMirrorDoc;

	@IsString()
	@IsOptional()
	notebookId?: string;

	/**
	 * クライアント側で編集を行った時点の updatedAt（ISO8601 / UTC オフセット付き）。
	 * 未指定時は従来挙動（無条件上書き）。
	 * 指定時は last-write-wins 比較に使用される。
	 */
	@IsOptional()
	@IsISO8601({ strict: true })
	@Matches(/(?:Z|[+-]\d{2}:?\d{2})$/, {
		message: 'clientUpdatedAt must include timezone offset (Z or ±HH:MM)',
	})
	clientUpdatedAt?: string;
}

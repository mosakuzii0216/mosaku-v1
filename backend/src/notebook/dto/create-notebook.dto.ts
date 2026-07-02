import { IsString, MaxLength, IsOptional } from 'class-validator';
import { IsProseMirrorDoc, type ProseMirrorDoc } from '../../common/utils/prosemirror-types';

export class CreateNotebookDto {
	@IsString()
	@IsOptional()
	@MaxLength(100)
	name?: string | null;

	@IsString()
	@IsOptional()
	themeId?: string | null;

	@IsProseMirrorDoc({ nullable: true })
	@IsOptional()
	content?: ProseMirrorDoc | null;
}

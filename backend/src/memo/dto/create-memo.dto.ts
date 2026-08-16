import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';
import { IsProseMirrorDoc, type ProseMirrorDoc } from '../../common/utils/prosemirror-types';

export class CreateMemoDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	title: string;

	@IsProseMirrorDoc()
	content: ProseMirrorDoc;

	@IsString()
	@IsOptional()
	notebookId?: string;
}

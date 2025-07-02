import { IsString, IsOptional } from 'class-validator';

export class SearchMemoDto {
  @IsString()
  @IsOptional()
  q?: string;
}

import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateMemoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @IsString()
  content: string;
}

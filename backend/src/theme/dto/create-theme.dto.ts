import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsBoolean,
  IsOptional,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateThemeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isPublic?: boolean = false;

  @IsObject()
  @IsNotEmpty()
  styles: any; // ThemeStyles型だが、JSONのためanyで受け取り
}

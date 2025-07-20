import { IsString, IsNotEmpty, MaxLength, Matches } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a valid hex color code (e.g., #FF5733)',
  })
  color: string;
}

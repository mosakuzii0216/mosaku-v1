import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

/**
 * 受信者向け招待コード検証 DTO。
 * 旧 32 文字 hex と新 10 文字 nanoid を包含する 8〜50 文字・英数字のみで制約。
 */
export class VerifyInvitationContextDto {
	@IsNotEmpty()
	@IsString()
	@Length(8, 50)
	@Matches(/^[0-9A-Za-z]+$/, {
		message: 'code must contain only alphanumeric characters',
	})
	code: string;
}

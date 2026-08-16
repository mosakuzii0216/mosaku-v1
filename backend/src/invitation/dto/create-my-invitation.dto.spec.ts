import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateMyInvitationDto } from './create-my-invitation.dto';
import { MAX_CAMPAIGN_MAX_USES } from '../constants';

describe('CreateMyInvitationDto', () => {
	function toDto(plain: Record<string, unknown>) {
		return plainToInstance(CreateMyInvitationDto, plain);
	}

	it('maxUses 省略時: バリデーション通過（既定 1）', async () => {
		const errors = await validate(toDto({}));
		expect(errors).toHaveLength(0);
	});

	it('maxUses=5: バリデーション通過', async () => {
		const errors = await validate(toDto({ maxUses: 5 }));
		expect(errors).toHaveLength(0);
	});

	it(`maxUses=1: 下限ちょうど → 通過`, async () => {
		const errors = await validate(toDto({ maxUses: 1 }));
		expect(errors).toHaveLength(0);
	});

	it(`maxUses=${MAX_CAMPAIGN_MAX_USES}: 上限ちょうど → 通過`, async () => {
		const errors = await validate(toDto({ maxUses: MAX_CAMPAIGN_MAX_USES }));
		expect(errors).toHaveLength(0);
	});

	it('maxUses=0: @Min(1) 違反 → エラー', async () => {
		const errors = await validate(toDto({ maxUses: 0 }));
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0].property).toBe('maxUses');
	});

	it(`maxUses=${MAX_CAMPAIGN_MAX_USES + 1}: @Max(${MAX_CAMPAIGN_MAX_USES}) 違反 → エラー`, async () => {
		const errors = await validate(toDto({ maxUses: MAX_CAMPAIGN_MAX_USES + 1 }));
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0].property).toBe('maxUses');
	});

	it('maxUses=1.5: @IsInt 違反 → エラー', async () => {
		const errors = await validate(toDto({ maxUses: 1.5 }));
		expect(errors.length).toBeGreaterThan(0);
	});
});

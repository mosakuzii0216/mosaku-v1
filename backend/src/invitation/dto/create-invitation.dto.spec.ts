import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateInvitationDto } from './create-invitation.dto';

describe('CreateInvitationDto — perk バリデーション', () => {
	function toDto(plain: Record<string, unknown>) {
		return plainToInstance(CreateInvitationDto, plain);
	}

	describe('perkType=COMP', () => {
		it('perkCompMonths 未指定 → @IsDefined 違反 → エラー', async () => {
			const errors = await validate(toDto({ perkType: 'COMP' }));
			expect(errors.length).toBeGreaterThan(0);
			const monthsErr = errors.find((e) => e.property === 'perkCompMonths');
			expect(monthsErr).toBeDefined();
		});

		it('perkCompMonths=4 → @Max(3) 違反 → エラー', async () => {
			const errors = await validate(toDto({ perkType: 'COMP', perkCompMonths: 4 }));
			expect(errors.length).toBeGreaterThan(0);
			const monthsErr = errors.find((e) => e.property === 'perkCompMonths');
			expect(monthsErr).toBeDefined();
		});

		it('perkCompMonths=0 → @Min(1) 違反 → エラー', async () => {
			const errors = await validate(toDto({ perkType: 'COMP', perkCompMonths: 0 }));
			expect(errors.length).toBeGreaterThan(0);
		});

		it('perkCompMonths=1 → 通過', async () => {
			const errors = await validate(toDto({ perkType: 'COMP', perkCompMonths: 1 }));
			expect(errors).toHaveLength(0);
		});

		it('perkCompMonths=2 → 通過', async () => {
			const errors = await validate(toDto({ perkType: 'COMP', perkCompMonths: 2 }));
			expect(errors).toHaveLength(0);
		});

		it('perkCompMonths=3 → 通過', async () => {
			const errors = await validate(toDto({ perkType: 'COMP', perkCompMonths: 3 }));
			expect(errors).toHaveLength(0);
		});
	});

	describe('perkType=NONE（または省略）', () => {
		it('perkCompMonths 未指定 → 通過', async () => {
			const errors = await validate(toDto({ perkType: 'NONE' }));
			expect(errors).toHaveLength(0);
		});

		it('perkType 省略 → 通過', async () => {
			const errors = await validate(toDto({}));
			expect(errors).toHaveLength(0);
		});

		it('perkCompMonths=2 指定 + perkType=NONE → エラー', async () => {
			const errors = await validate(toDto({ perkType: 'NONE', perkCompMonths: 2 }));
			expect(errors.length).toBeGreaterThan(0);
		});
	});

	describe('maxUses', () => {
		it('省略時 → 通過', async () => {
			const errors = await validate(toDto({}));
			expect(errors).toHaveLength(0);
		});

		it('maxUses=10 → 通過', async () => {
			const errors = await validate(toDto({ maxUses: 10 }));
			expect(errors).toHaveLength(0);
		});

		it('maxUses=0 → @Min(1) エラー', async () => {
			const errors = await validate(toDto({ maxUses: 0 }));
			expect(errors.length).toBeGreaterThan(0);
		});
	});
});

import { Test, TestingModule } from '@nestjs/testing';
import type { InvitationPerkType } from '@prisma/client';
import { PerkGate } from './perk-gate';
import { ConfigService } from '../config/config.service';

describe('PerkGate', () => {
	let gate: PerkGate;
	let configService: { compPerkEnabled: boolean };

	beforeEach(async () => {
		configService = { compPerkEnabled: false };

		const moduleRef: TestingModule = await Test.createTestingModule({
			providers: [PerkGate, { provide: ConfigService, useValue: configService }],
		}).compile();

		gate = moduleRef.get(PerkGate);
	});

	const noneInv = { perkType: 'NONE' as InvitationPerkType, perkCompMonths: null };
	const compInv = (months: number | null) => ({
		perkType: 'COMP' as InvitationPerkType,
		perkCompMonths: months,
	});

	describe('resolvePerk', () => {
		describe('フラグ OFF（COMP_PERK_ENABLED=false）', () => {
			it('COMP コードでも常に none を返す', () => {
				configService.compPerkEnabled = false;
				expect(gate.resolvePerk(compInv(3))).toEqual({ type: 'none' });
			});

			it('NONE コードでも none を返す', () => {
				configService.compPerkEnabled = false;
				expect(gate.resolvePerk(noneInv)).toEqual({ type: 'none' });
			});
		});

		describe('フラグ ON（COMP_PERK_ENABLED=true）', () => {
			beforeEach(() => {
				configService.compPerkEnabled = true;
			});

			it('COMP + months:1 → { type:comp, months:1 }', () => {
				expect(gate.resolvePerk(compInv(1))).toEqual({ type: 'comp', months: 1 });
			});

			it('COMP + months:2 → { type:comp, months:2 }', () => {
				expect(gate.resolvePerk(compInv(2))).toEqual({ type: 'comp', months: 2 });
			});

			it('COMP + months:3 → { type:comp, months:3 }', () => {
				expect(gate.resolvePerk(compInv(3))).toEqual({ type: 'comp', months: 3 });
			});

			it('COMP + months:null → none フォールバック', () => {
				expect(gate.resolvePerk(compInv(null))).toEqual({ type: 'none' });
			});

			it('COMP + months:0（下限外）→ none フォールバック', () => {
				expect(gate.resolvePerk(compInv(0))).toEqual({ type: 'none' });
			});

			it('COMP + months:4（上限外）→ none フォールバック', () => {
				expect(gate.resolvePerk(compInv(4))).toEqual({ type: 'none' });
			});

			it('NONE + months:null → none', () => {
				expect(gate.resolvePerk(noneInv)).toEqual({ type: 'none' });
			});
		});
	});

	it('applyPerk メソッドを持たない（後続 spec のスコープ・回帰テスト）', () => {
		expect((gate as unknown as Record<string, unknown>)['applyPerk']).toBeUndefined();
	});
});

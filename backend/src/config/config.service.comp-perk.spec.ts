import { ConfigService } from './config.service';

describe('ConfigService.compPerkEnabled (COMP 縮退ゲート)', () => {
	let service: ConfigService;
	const originalEnv = process.env;

	beforeEach(() => {
		service = new ConfigService();
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it('COMP_PERK_ENABLED 未設定のとき false を返す', () => {
		delete process.env.COMP_PERK_ENABLED;
		expect(service.compPerkEnabled).toBe(false);
	});

	it('COMP_PERK_ENABLED=true のとき true を返す', () => {
		process.env.COMP_PERK_ENABLED = 'true';
		expect(service.compPerkEnabled).toBe(true);
	});

	it('COMP_PERK_ENABLED=false のとき false を返す', () => {
		process.env.COMP_PERK_ENABLED = 'false';
		expect(service.compPerkEnabled).toBe(false);
	});

	it('COMP_PERK_ENABLED が任意の文字列（"yes" 等）のとき false を返す', () => {
		process.env.COMP_PERK_ENABLED = 'yes';
		expect(service.compPerkEnabled).toBe(false);
	});
});

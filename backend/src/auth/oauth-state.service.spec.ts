import { createHmac } from 'crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '../config/config.service';
import { OAuthStateCrypto } from './oauth-state-crypto.service';
import { OAuthStateService } from './oauth-state.service';
import { AppException } from '../common/exceptions';

describe('OAuthStateService', () => {
	const HMAC_SECRET = 'a'.repeat(64);
	const ENC_KEY_HEX = Buffer.alloc(32, 0xcd).toString('hex');

	const mockConfig = {
		get invitationStateSecret(): string {
			return HMAC_SECRET;
		},
		get oauthStateEncKey(): Buffer {
			return Buffer.from(ENC_KEY_HEX, 'hex');
		},
	};

	let service: OAuthStateService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				OAuthStateService,
				OAuthStateCrypto,
				{ provide: ConfigService, useValue: mockConfig },
			],
		}).compile();
		service = module.get<OAuthStateService>(OAuthStateService);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	// ─── 往復テスト ─────────────────────────────────────────────────────

	it('code あり・verifier なし: issueState → verifyState で payload を復元できること', () => {
		const state = service.issueState({ provider: 'google', code: 'INV001' });
		const payload = service.verifyState(state, 'google');
		expect(payload.code).toBe('INV001');
		expect(payload.provider).toBe('google');
		expect(payload.verifier).toBeUndefined();
	});

	it('code なし・verifier なし: issueState → verifyState で payload を復元できること', () => {
		const state = service.issueState({ provider: 'apple' });
		const payload = service.verifyState(state, 'apple');
		expect(payload.code).toBeUndefined();
		expect(payload.provider).toBe('apple');
	});

	it('code あり・verifier あり: verifyState で verifier が平文で復元されること', () => {
		const state = service.issueState({
			provider: 'x',
			code: 'INV002',
			verifier: 'verifier43chars',
		});
		const payload = service.verifyState(state, 'x');
		expect(payload.code).toBe('INV002');
		expect(payload.verifier).toBe('verifier43chars');
	});

	it('code なし・verifier あり: verifyState で verifier が復元されること', () => {
		const state = service.issueState({ provider: 'x', verifier: 'plain_verifier_xyz' });
		const payload = service.verifyState(state, 'x');
		expect(payload.code).toBeUndefined();
		expect(payload.verifier).toBe('plain_verifier_xyz');
	});

	// ─── X state 長制約 ─────────────────────────────────────────────────

	it('X の state（verifier あり）は 500 文字以内であること', () => {
		const verifier43 = 'A'.repeat(43);
		const invCode = 'INVITE_CODE_50CHARS_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'.slice(0, 50);
		const state = service.issueState({ provider: 'x', code: invCode, verifier: verifier43 });
		expect(state.length).toBeLessThanOrEqual(500);
	});

	// ─── TTL 超過 ───────────────────────────────────────────────────────

	it('iat が 10 分以上経過した state は拒否されること', () => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const state = service.issueState({ provider: 'google', code: 'CODE1' });

		jest.setSystemTime(new Date('2026-01-01T00:10:01Z'));
		expect(() => service.verifyState(state, 'google')).toThrow(AppException);
	});

	// ─── provider 不一致 ─────────────────────────────────────────────────

	it('provider 不一致は拒否されること', () => {
		const state = service.issueState({ provider: 'google', code: 'CODE1' });
		expect(() => service.verifyState(state, 'apple')).toThrow(AppException);
	});

	it('廃止プロバイダ（github）を名乗る偽造 state は SUPPORTED_PROVIDERS で拒否されること', () => {
		const secret = Buffer.from(HMAC_SECRET);
		const forgedPayload = {
			v: 1,
			p: 'github',
			n: 'a'.repeat(32),
			t: Date.now(),
		};
		const encodedPayload = Buffer.from(JSON.stringify(forgedPayload), 'utf8').toString('base64url');
		const sig = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
		const forgedState = `${encodedPayload}.${sig}`;

		expect(() =>
			service.verifyState(
				forgedState,
				'github' as unknown as Parameters<typeof service.verifyState>[1],
			),
		).toThrow(AppException);
	});

	// ─── HMAC 改ざん ─────────────────────────────────────────────────────

	it('payload 改ざんは拒否されること（HMAC 不一致）', () => {
		const state = service.issueState({ provider: 'google', code: 'CODE1' });
		const [, sig] = state.split('.');
		const tamperedPayload = Buffer.from(
			JSON.stringify({ v: 1, p: 'google', c: 'EVIL', n: 'a'.repeat(32), t: Date.now() }),
		).toString('base64url');
		expect(() => service.verifyState(`${tamperedPayload}.${sig}`, 'google')).toThrow(AppException);
	});

	// ─── 不正形式 ────────────────────────────────────────────────────────

	it('base64 不正な文字列は拒否されること', () => {
		expect(() => service.verifyState('not-a-valid-state', 'google')).toThrow(AppException);
	});

	it('セパレータ . を持たない文字列は拒否されること', () => {
		expect(() => service.verifyState('abcdefg', 'google')).toThrow(AppException);
	});

	// ─── wire 後方互換（旧長キー payload）────────────────────────────────

	it('旧長キー payload（code,provider,nonce,iat）も verifyState で受理されること', () => {
		const secret = Buffer.from(HMAC_SECRET);
		const oldPayload = {
			code: 'OLD_CODE',
			provider: 'google',
			nonce: 'n'.repeat(32),
			iat: Date.now(),
		};
		const encodedPayload = Buffer.from(JSON.stringify(oldPayload), 'utf8').toString('base64url');
		const sig = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
		const oldState = `${encodedPayload}.${sig}`;

		const result = service.verifyState(oldState, 'google');
		expect(result.code).toBe('OLD_CODE');
		expect(result.provider).toBe('google');
	});

	// ─── nonce 一意性 ────────────────────────────────────────────────────

	it('nonce は呼び出しごとに異なること', () => {
		const s1 = service.issueState({ provider: 'google', code: 'C' });
		const s2 = service.issueState({ provider: 'google', code: 'C' });
		const p1 = service.verifyState(s1, 'google');
		const p2 = service.verifyState(s2, 'google');
		expect(p1.nonce).not.toBe(p2.nonce);
	});
});

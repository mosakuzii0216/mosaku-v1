import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { ConfigService } from '../config/config.service';
import { OAuthStateCrypto } from './oauth-state-crypto.service';
import { ERROR_CODES, throwBadRequest } from '../common/exceptions';
import type { OAuthProvider } from './types/oauth.types';

export interface OAuthStatePayload {
	readonly v: 1;
	readonly provider: OAuthProvider;
	readonly code?: string;
	readonly verifier?: string; // verifyState 戻り値でのみ平文（state 上は ev に暗号化）
	readonly nonce: string;
	readonly iat: number;
}

export interface IssueStateInput {
	readonly provider: OAuthProvider;
	readonly code?: string;
	readonly verifier?: string; // 平文を渡すと内部で AEAD 封緘
}

/** 短キー wire payload（X の 500 文字制限対策） */
interface WirePayload {
	v: 1;
	p: OAuthProvider;
	c?: string; // code
	ev?: string; // encrypted verifier
	n: string; // nonce
	t: number; // iat
}

const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const NONCE_BYTES = 16;
const SUPPORTED_PROVIDERS: ReadonlySet<OAuthProvider> = new Set([
	'google',
	'github',
	'line',
	'apple',
	'x',
]);

@Injectable()
export class OAuthStateService {
	constructor(
		private readonly configService: ConfigService,
		private readonly crypto: OAuthStateCrypto,
	) {}

	issueState(input: IssueStateInput): string {
		const { provider, code, verifier } = input;

		const wire: WirePayload = {
			v: 1,
			p: provider,
			n: randomBytes(NONCE_BYTES).toString('hex'),
			t: Date.now(),
			...(code !== undefined ? { c: code } : {}),
			...(verifier !== undefined ? { ev: this.crypto.seal(verifier) } : {}),
		};

		const encodedPayload = Buffer.from(JSON.stringify(wire), 'utf8').toString('base64url');
		const signature = this.sign(encodedPayload);
		return `${encodedPayload}.${signature}`;
	}

	verifyState(signedState: string, expectedProvider: OAuthProvider): OAuthStatePayload {
		if (typeof signedState !== 'string' || signedState.length === 0) {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}

		const separatorIndex = signedState.indexOf('.');
		if (separatorIndex <= 0 || separatorIndex === signedState.length - 1) {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}

		const encodedPayload = signedState.slice(0, separatorIndex);
		const providedSignature = signedState.slice(separatorIndex + 1);

		if (!this.isBase64Url(encodedPayload) || !this.isBase64Url(providedSignature)) {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}

		const expectedSignature = this.sign(encodedPayload);
		if (!this.safeEqual(providedSignature, expectedSignature)) {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}

		const raw = this.decodePayloadRaw(encodedPayload);

		// 新短キー形式または旧長キー形式を判定して正規化
		const { provider, code, nonce, iat, encryptedVerifier } = this.normalizeWirePayload(raw);

		if (!SUPPORTED_PROVIDERS.has(provider)) {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}
		if (provider !== expectedProvider) {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}
		if (Date.now() - iat > STATE_MAX_AGE_MS) {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}

		let verifier: string | undefined;
		if (encryptedVerifier !== undefined) {
			try {
				verifier = this.crypto.open(encryptedVerifier);
			} catch {
				throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
			}
		}

		return {
			v: 1,
			provider,
			nonce,
			iat,
			...(code !== undefined ? { code } : {}),
			...(verifier !== undefined ? { verifier } : {}),
		};
	}

	/**
	 * 招待コードを best-effort で抽出する（署名検証前）。
	 * 無効 state 時に invite ページへ誘導するための用途。短キー `c` と旧 `code` の両方を読む。
	 */
	tryExtractInvitationCode(signedState: string): string | undefined {
		try {
			const separatorIndex = signedState.indexOf('.');
			if (separatorIndex <= 0) return undefined;
			const encodedPayload = signedState.slice(0, separatorIndex);
			const json = Buffer.from(encodedPayload, 'base64url').toString('utf8');
			const parsed = JSON.parse(json) as Record<string, unknown>;
			const code = parsed['c'] ?? parsed['code'];
			return typeof code === 'string' ? code : undefined;
		} catch {
			return undefined;
		}
	}

	private normalizeWirePayload(raw: unknown): {
		provider: OAuthProvider;
		code?: string;
		nonce: string;
		iat: number;
		encryptedVerifier?: string;
	} {
		if (!raw || typeof raw !== 'object') {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}
		const obj = raw as Record<string, unknown>;

		// 新短キー形式（v === 1 がある）
		if (obj['v'] === 1) {
			if (
				typeof obj['p'] !== 'string' ||
				typeof obj['n'] !== 'string' ||
				typeof obj['t'] !== 'number'
			) {
				throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
			}
			return {
				provider: obj['p'] as OAuthProvider,
				code: typeof obj['c'] === 'string' ? obj['c'] : undefined,
				nonce: obj['n'],
				iat: obj['t'],
				encryptedVerifier: typeof obj['ev'] === 'string' ? obj['ev'] : undefined,
			};
		}

		// 旧長キー形式（後方互換・1 リリース限定）
		if (
			typeof obj['code'] === 'string' &&
			typeof obj['provider'] === 'string' &&
			typeof obj['nonce'] === 'string' &&
			typeof obj['iat'] === 'number'
		) {
			return {
				provider: obj['provider'] as OAuthProvider,
				code: obj['code'],
				nonce: obj['nonce'],
				iat: obj['iat'],
			};
		}

		throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
	}

	private sign(encodedPayload: string): string {
		const secret = this.configService.invitationStateSecret;
		return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
	}

	private decodePayloadRaw(encodedPayload: string): unknown {
		let json: string;
		try {
			json = Buffer.from(encodedPayload, 'base64url').toString('utf8');
		} catch {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}

		try {
			return JSON.parse(json);
		} catch {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}
	}

	private isBase64Url(value: string): boolean {
		return /^[A-Za-z0-9_-]+$/.test(value);
	}

	private safeEqual(a: string, b: string): boolean {
		const bufferA = Buffer.from(a);
		const bufferB = Buffer.from(b);
		if (bufferA.length !== bufferB.length) {
			return false;
		}
		return timingSafeEqual(bufferA, bufferB);
	}
}

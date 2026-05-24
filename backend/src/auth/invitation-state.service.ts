import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { ConfigService } from '../config/config.service';
import { ERROR_CODES, throwBadRequest } from '../common/exceptions';
import type { OAuthProvider } from './types/oauth.types';

export interface InvitationStatePayload {
	code: string;
	provider: OAuthProvider;
	nonce: string;
	iat: number;
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
export class InvitationStateService {
	constructor(private readonly configService: ConfigService) {}

	issueState(code: string, provider: OAuthProvider): string {
		const payload: InvitationStatePayload = {
			code,
			provider,
			nonce: randomBytes(NONCE_BYTES).toString('hex'),
			iat: Date.now(),
		};

		const encodedPayload = this.encodePayload(payload);
		const signature = this.sign(encodedPayload);
		return `${encodedPayload}.${signature}`;
	}

	verifyState(signedState: string, expectedProvider: OAuthProvider): InvitationStatePayload {
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

		const payload = this.decodePayload(encodedPayload);

		if (!SUPPORTED_PROVIDERS.has(payload.provider)) {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}
		if (payload.provider !== expectedProvider) {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}
		if (Date.now() - payload.iat > STATE_MAX_AGE_MS) {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}

		return payload;
	}

	private sign(encodedPayload: string): string {
		const secret = this.configService.invitationStateSecret;
		return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
	}

	private encodePayload(payload: InvitationStatePayload): string {
		return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
	}

	private decodePayload(encodedPayload: string): InvitationStatePayload {
		let json: string;
		try {
			json = Buffer.from(encodedPayload, 'base64url').toString('utf8');
		} catch {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(json);
		} catch {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}

		if (!this.isStatePayload(parsed)) {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}

		return parsed;
	}

	private isStatePayload(value: unknown): value is InvitationStatePayload {
		if (!value || typeof value !== 'object') {
			return false;
		}
		const candidate = value as Record<string, unknown>;
		return (
			typeof candidate.code === 'string' &&
			typeof candidate.provider === 'string' &&
			typeof candidate.nonce === 'string' &&
			typeof candidate.iat === 'number'
		);
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

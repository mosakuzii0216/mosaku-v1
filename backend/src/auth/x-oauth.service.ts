import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { AppLogger } from '../common/logger/app-logger.service';
import type { XStrategyUser } from './types/oauth.types';

interface XTokenResponse {
	access_token: string;
}

interface XProfileResponse {
	data: {
		id?: string;
		name?: string;
		username?: string;
		profile_image_url?: string;
	};
}

@Injectable()
export class XOAuthService {
	private readonly logger = new AppLogger();
	private readonly configured: boolean;

	constructor(private readonly configService: ConfigService) {
		this.configured = !!(configService.xClientId && configService.xClientSecret);
		this.logger.setContext('XOAuthService');
		if (!this.configured) {
			this.logger.warn(
				'X OAuth is not configured. Set X_CLIENT_ID and X_CLIENT_SECRET to enable X login.',
			);
		}
	}

	isConfigured(): boolean {
		return this.configured;
	}

	async exchangeCodeForUser(input: { code: string; verifier: string }): Promise<XStrategyUser> {
		const { code, verifier } = input;
		const clientId = this.configService.xClientId!;
		const clientSecret = this.configService.xClientSecret!;
		const redirectUri = this.configService.xRedirectUri;

		const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
		const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
			method: 'POST',
			headers: {
				Authorization: `Basic ${credentials}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: redirectUri,
				code_verifier: verifier,
			}).toString(),
		});

		if (!tokenRes.ok) {
			throw new Error(`X token exchange failed with status ${tokenRes.status}`);
		}

		const tokenData = (await tokenRes.json()) as XTokenResponse;
		const accessToken = tokenData.access_token;

		const profileRes = await fetch(
			'https://api.twitter.com/2/users/me?user.fields=profile_image_url',
			{ headers: { Authorization: `Bearer ${accessToken}` } },
		);

		if (!profileRes.ok) {
			throw new Error(`X profile fetch failed with status ${profileRes.status}`);
		}

		const profileData = (await profileRes.json()) as XProfileResponse;
		const { id, name, username, profile_image_url } = profileData.data;

		if (!id) {
			throw new Error('X profile response missing required field: id');
		}

		return {
			xId: id,
			name: name ?? username ?? id,
			username,
			email: undefined,
			picture: profile_image_url,
			accessToken,
		};
	}
}

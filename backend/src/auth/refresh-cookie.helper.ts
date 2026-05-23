import { Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { ConfigService } from '../config/config.service';
import { REFRESH_COOKIE_NAME } from '../config/auth-constants';

@Injectable()
export class RefreshCookieHelper {
	constructor(private readonly configService: ConfigService) {}

	setRefreshCookie(res: Response, plainRt: string, expiresAt: Date): void {
		res.cookie(REFRESH_COOKIE_NAME, plainRt, {
			...this.buildBaseOptions(),
			expires: expiresAt,
		});
	}

	clearRefreshCookie(res: Response): void {
		res.clearCookie(REFRESH_COOKIE_NAME, this.buildBaseOptions());
	}

	private buildBaseOptions(): CookieOptions {
		const { sameSite, secure, path, domain } = this.configService.refreshCookieOptions;
		const options: CookieOptions = {
			httpOnly: true,
			secure,
			sameSite,
			path,
		};
		if (domain) {
			options.domain = domain;
		}
		return options;
	}
}

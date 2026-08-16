import { Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { ConfigService } from '../config/config.service';
import { REFRESH_COOKIE_NAME } from '../config/auth-constants';

@Injectable()
export class RefreshCookieHelper {
	constructor(private readonly configService: ConfigService) {}

	setRefreshCookie(res: Response, plainRt: string, expiresAt: Date): void {
		this.evictLegacyHostOnlyCookie(res);
		res.cookie(REFRESH_COOKIE_NAME, plainRt, {
			...this.buildBaseOptions(),
			expires: expiresAt,
		});
	}

	clearRefreshCookie(res: Response): void {
		this.evictLegacyHostOnlyCookie(res);
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

	/**
	 * Domain 属性を持たない（host-only）旧 Refresh Cookie を明示的に失効させる。
	 *
	 * `REFRESH_COOKIE_DOMAIN` 導入前は Domain 無し = host-only（例: api.mosaku.jp）で
	 * 発行されていた。現行は Domain=.mosaku.jp で発行するため両者はブラウザ上で別 Cookie
	 * 扱いとなり、同名の Cookie が 2 つ共存しうる。host-only の方がスコープがより具体的なため
	 * Cookie ヘッダの先頭に並び、cookie-parser が古い（失効済みの）値を読んでしまい
	 * Refresh が AUTH011 で失敗する。これを防ぐため、Cookie を発行/破棄するたびに
	 * host-only 変種を expire させて駆逐する。
	 *
	 * Domain 未設定（ローカル開発など）では現行 Cookie 自体が host-only なので何もしない。
	 */
	private evictLegacyHostOnlyCookie(res: Response): void {
		const { sameSite, secure, path, domain } = this.configService.refreshCookieOptions;
		if (!domain) {
			return;
		}
		res.clearCookie(REFRESH_COOKIE_NAME, {
			httpOnly: true,
			secure,
			sameSite,
			path,
		});
	}
}

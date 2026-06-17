import {
	Controller,
	Post,
	Get,
	Body,
	Query,
	Req,
	Res,
	HttpCode,
	HttpStatus,
	Param,
	UseGuards,
	BadRequestException,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { McpOAuthService } from './mcp-oauth.service';
import { McpFeatureFlagGuard } from '../mcp-feature-flag.guard';
import { ConfigService } from '../../config/config.service';
import { THROTTLE_CONFIG } from '../../config/auth-constants';

interface McpAuthorizeParams {
	clientId: string;
	redirectUri: string;
	codeChallenge: string;
	scope: string;
	state?: string;
	resource: string;
}

/** cookie-session に保存する MCP 認可フロー用データ型。 */
interface McpSession {
	mcpUserId?: string;
	/** ソーシャルログイン完了後に戻る /oauth/authorize URL。 */
	mcpAuthorizeReturn?: string;
	/** GET /oauth/authorize で受け取った認可パラメータ（同意 POST まで保持）。 */
	mcpAuthorizeParams?: McpAuthorizeParams;
}

type McpSessionRequest = ExpressRequest & { session: ExpressRequest['session'] & McpSession };

const ALLOWED_SOCIAL_PROVIDERS = ['google', 'github', 'line'] as const;

/**
 * OAuth 認可サーバーの DCR / authorize / token エンドポイント（4.2〜4.4）。
 *
 * - @Public() でグローバル JWT Guard を opt-out（ブラウザからの無認証アクセスを許可）。
 * - McpFeatureFlagGuard で feature flag OFF 時は 404 にする。
 */
@Public()
@Controller('oauth')
@UseGuards(McpFeatureFlagGuard)
export class OAuthController {
	constructor(
		private readonly oauthService: McpOAuthService,
		private readonly config: ConfigService,
	) {}

	/** 4.2: Dynamic Client Registration (RFC 7591) */
	@Post('register')
	@Throttle({
		default: { limit: THROTTLE_CONFIG.MCP_OAUTH.LIMIT, ttl: THROTTLE_CONFIG.MCP_OAUTH.TTL },
	})
	async register(@Body() body: Record<string, unknown>) {
		const clientName = typeof body.client_name === 'string' ? body.client_name : 'Unknown Client';
		const redirectUris = Array.isArray(body.redirect_uris) ? (body.redirect_uris as string[]) : [];
		const grantTypes = Array.isArray(body.grant_types)
			? (body.grant_types as string[])
			: ['authorization_code', 'refresh_token'];

		const client = await this.oauthService.registerClient({ clientName, redirectUris, grantTypes });

		return {
			client_id: client.id,
			client_name: client.clientName,
			redirect_uris: client.redirectUris,
			grant_types: client.grantTypes,
			token_endpoint_auth_method: client.tokenEndpointAuthMethod,
		};
	}

	/**
	 * 4.3: authorize エンドポイント。
	 * - セッションに mcpUserId がある → 同意画面 HTML を返す。
	 * - なければ → ソーシャルログイン選択画面 HTML を返す。
	 */
	@Get('authorize')
	@Throttle({
		default: { limit: THROTTLE_CONFIG.MCP_OAUTH.LIMIT, ttl: THROTTLE_CONFIG.MCP_OAUTH.TTL },
	})
	async authorize(
		@Query() query: Record<string, string>,
		@Req() req: McpSessionRequest,
		@Res() res: ExpressResponse,
	): Promise<void> {
		const { client_id, redirect_uri, code_challenge, scope, state, resource } = query;

		if (!client_id || !redirect_uri || !code_challenge) {
			res
				.status(400)
				.send(
					this.renderErrorPage(
						'パラメータが不足しています（client_id, redirect_uri, code_challenge が必要）。',
					),
				);
			return;
		}

		const session = req.session as unknown as McpSession;
		session.mcpAuthorizeParams = {
			clientId: client_id,
			redirectUri: redirect_uri,
			codeChallenge: code_challenge,
			scope: scope ?? 'memo:read memo:write',
			state,
			resource: resource ?? this.config.mcpCanonicalUrl,
		};

		res.setHeader('Content-Type', 'text/html; charset=utf-8');
		res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline'");

		if (session.mcpUserId) {
			res.send(
				this.renderConsentPage({
					clientId: client_id,
					scope: scope ?? 'memo:read memo:write',
				}),
			);
		} else {
			res.send(this.renderLoginPage());
		}
	}

	/** 4.3: ソーシャルログイン起点。セッションに復帰先を保存して既存 social login へリダイレクト。 */
	@Get('authorize/login-start/:provider')
	loginStart(
		@Param('provider') provider: string,
		@Req() req: McpSessionRequest,
		@Res() res: ExpressResponse,
	): void {
		if (!(ALLOWED_SOCIAL_PROVIDERS as readonly string[]).includes(provider)) {
			res
				.status(400)
				.send(this.renderErrorPage(`不明なプロバイダです: ${this.escapeHtml(provider)}`));
			return;
		}

		const session = req.session as unknown as McpSession;
		session.mcpAuthorizeReturn = `${this.config.backendUrl}/oauth/authorize`;

		res.redirect(`/auth/${provider}`);
	}

	/** 4.3: 同意フォーム送信処理。approve → 認可コード発行 & リダイレクト、deny → エラーリダイレクト。 */
	@Post('authorize/consent')
	@HttpCode(HttpStatus.FOUND)
	async consent(
		@Body() body: Record<string, unknown>,
		@Req() req: McpSessionRequest,
		@Res() res: ExpressResponse,
	): Promise<void> {
		const session = req.session as unknown as McpSession;
		const userId = session.mcpUserId;
		const params = session.mcpAuthorizeParams;

		if (!userId || !params) {
			res
				.status(400)
				.send(this.renderErrorPage('セッションが無効です。最初からやり直してください。'));
			return;
		}

		if (body.action === 'deny') {
			session.mcpUserId = undefined;
			session.mcpAuthorizeParams = undefined;
			const url = new URL(params.redirectUri);
			url.searchParams.set('error', 'access_denied');
			if (params.state) url.searchParams.set('state', params.state);
			res.redirect(url.toString());
			return;
		}

		const { code } = await this.oauthService.issueAuthCode({
			clientId: params.clientId,
			userId,
			redirectUri: params.redirectUri,
			codeChallenge: params.codeChallenge,
			scope: params.scope,
			resource: params.resource,
			state: params.state,
		});

		session.mcpUserId = undefined;
		session.mcpAuthorizeParams = undefined;

		const url = new URL(params.redirectUri);
		url.searchParams.set('code', code);
		if (params.state) url.searchParams.set('state', params.state);
		res.redirect(url.toString());
	}

	/** 4.4: token エンドポイント。authorization_code / refresh_token の 2 グラントをサポート。 */
	@Post('token')
	@HttpCode(HttpStatus.OK)
	@Throttle({
		default: { limit: THROTTLE_CONFIG.MCP_OAUTH.LIMIT, ttl: THROTTLE_CONFIG.MCP_OAUTH.TTL },
	})
	async token(@Body() body: Record<string, unknown>) {
		const grantType = body.grant_type;

		if (grantType === 'authorization_code') {
			const code = body.code as string;
			const codeVerifier = body.code_verifier as string;
			const clientId = body.client_id as string;
			const redirectUri = body.redirect_uri as string;
			const resource =
				typeof body.resource === 'string' ? body.resource : this.config.mcpCanonicalUrl;

			if (!code || !codeVerifier || !clientId || !redirectUri) {
				throw new BadRequestException(
					'authorization_code grant には code, code_verifier, client_id, redirect_uri が必要です。',
				);
			}

			const tokens = await this.oauthService.exchangeAuthorizationCode({
				code,
				codeVerifier,
				clientId,
				redirectUri,
				resource,
			});

			return {
				access_token: tokens.accessToken,
				token_type: 'Bearer',
				expires_in: tokens.expiresIn,
				scope: tokens.scope,
				refresh_token: tokens.refreshToken,
			};
		}

		if (grantType === 'refresh_token') {
			const refreshToken = body.refresh_token as string;
			const clientId = body.client_id as string;

			if (!refreshToken || !clientId) {
				throw new BadRequestException(
					'refresh_token grant には refresh_token, client_id が必要です。',
				);
			}

			const tokens = await this.oauthService.exchangeRefreshToken({ refreshToken, clientId });

			return {
				access_token: tokens.accessToken,
				token_type: 'Bearer',
				expires_in: tokens.expiresIn,
				scope: tokens.scope,
				refresh_token: tokens.refreshToken,
			};
		}

		throw new BadRequestException(
			`未対応の grant_type: ${typeof grantType === 'string' ? grantType : '(不明)'}`,
		);
	}

	private renderConsentPage(params: { clientId: string; scope: string }): string {
		const scopes = params.scope.split(' ').filter(Boolean);
		const scopeHtml = scopes.map((s) => `<li>${this.escapeHtml(s)}</li>`).join('');
		return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>mosaku – アクセス許可</title>
<style>body{font-family:sans-serif;max-width:480px;margin:40px auto;padding:16px}
.btn{display:inline-block;padding:10px 24px;border:none;cursor:pointer;font-size:14px;
border-radius:4px;margin:4px}.approve{background:#2563eb;color:#fff}.deny{background:#e5e7eb;color:#111}
</style></head>
<body>
<h2>mosaku へのアクセスを許可しますか？</h2>
<p>クライアント <strong>${this.escapeHtml(params.clientId)}</strong> が以下のスコープを要求しています：</p>
<ul>${scopeHtml}</ul>
<form method="POST" action="/oauth/authorize/consent">
  <button type="submit" name="action" value="approve" class="btn approve">許可する</button>
  <button type="submit" name="action" value="deny" class="btn deny">拒否する</button>
</form>
</body></html>`;
	}

	private renderLoginPage(): string {
		const links = ALLOWED_SOCIAL_PROVIDERS.map(
			(p) =>
				`<a href="/oauth/authorize/login-start/${p}" class="btn">${this.providerLabel(p)} でログイン</a>`,
		).join('\n');
		return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>mosaku – ログイン</title>
<style>body{font-family:sans-serif;max-width:480px;margin:40px auto;padding:16px}
.btn{display:block;padding:10px 24px;border:1px solid #ccc;cursor:pointer;font-size:14px;
border-radius:4px;margin:8px 0;text-align:center;text-decoration:none;color:#111;background:#fff}
</style></head>
<body>
<h2>mosaku にログイン</h2>
<p>続行するには mosaku アカウントでログインしてください。</p>
${links}
</body></html>`;
	}

	private renderErrorPage(message: string): string {
		return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>エラー</title></head>
<body><h2>エラー</h2><p>${this.escapeHtml(message)}</p></body></html>`;
	}

	private escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	private providerLabel(provider: string): string {
		const labels: Record<string, string> = { google: 'Google', github: 'GitHub', line: 'LINE' };
		return labels[provider] ?? provider;
	}
}

import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { OAuthClientStore } from './oauth-client.store';
import { AuthCodeStore } from './auth-code.store';
import { McpRefreshTokenStore } from './refresh-token.store';
import { ConfigService } from '../../config/config.service';
import { MCP_ACCESS_TOKEN_EXPIRATION } from '../../config/auth-constants';
import type { McpScope } from '../../auth/jwt.service';

const AUTH_CODE_TTL_MS = 60_000;
const MCP_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MCP_VALID_SCOPES = new Set<string>(['memo:read', 'memo:write']);

export interface RegisterClientInput {
	clientName: string;
	redirectUris: string[];
	grantTypes?: string[];
}

export interface ExchangeCodeInput {
	code: string;
	codeVerifier: string;
	clientId: string;
	redirectUri: string;
	resource: string;
}

export interface ExchangeRefreshInput {
	refreshToken: string;
	clientId: string;
}

export interface IssuedTokens {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
	scope: string;
}

/**
 * MCP OAuth 認可サーバーのコアビジネスロジック。
 * DCR クライアント登録・認可コード発行・トークン交換・リフレッシュ回転を担う。
 */
@Injectable()
export class McpOAuthService {
	constructor(
		private readonly clientStore: OAuthClientStore,
		private readonly codeStore: AuthCodeStore,
		private readonly refreshStore: McpRefreshTokenStore,
		private readonly jwtService: JwtService,
		private readonly config: ConfigService,
	) {}

	/** 4.2: DCR クライアント登録。redirect_uris を検証してから永続化する。 */
	async registerClient(input: RegisterClientInput) {
		if (!input.redirectUris || input.redirectUris.length === 0) {
			throw new BadRequestException('redirect_uris は最低1つ必要です。');
		}
		for (const uri of input.redirectUris) {
			if (!this.isAllowedRedirectUri(uri)) {
				throw new BadRequestException(
					`redirect_uri "${uri}" は許可されていません。localhost または HTTPS のみ使用できます。`,
				);
			}
		}
		return this.clientStore.create({
			clientName: input.clientName,
			redirectUris: input.redirectUris,
			grantTypes: input.grantTypes ?? ['authorization_code', 'refresh_token'],
			tokenEndpointAuthMethod: 'none',
		});
	}

	/**
	 * PKCE S256 の検証。
	 * code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))
	 */
	verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
		if (!codeVerifier || !codeChallenge) return false;
		const computed = createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
		return computed === codeChallenge;
	}

	/** 4.3: 認可コードを発行して AuthCodeStore に保存する。TTL は 60 秒。 */
	async issueAuthCode(params: {
		clientId: string;
		userId: string;
		redirectUri: string;
		codeChallenge: string;
		scope: string;
		resource: string;
		state?: string;
	}): Promise<{ code: string; state?: string }> {
		const code = randomBytes(32).toString('base64url');
		const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS);

		await this.codeStore.create({
			code,
			clientId: params.clientId,
			userId: params.userId,
			redirectUri: params.redirectUri,
			codeChallenge: params.codeChallenge,
			scope: params.scope,
			resource: params.resource,
			expiresAt,
		});

		return { code, state: params.state };
	}

	/**
	 * 4.4: 認可コード交換。PKCE S256 照合・一回限り消費・MCP トークン発行をまとめて行う。
	 * コードは AuthCodeStore.findAndConsume でトランザクション内原子削除するため二重交換不可。
	 */
	async exchangeAuthorizationCode(input: ExchangeCodeInput): Promise<IssuedTokens> {
		const record = await this.codeStore.findAndConsume(input.code);
		if (!record) {
			throw new BadRequestException('認可コードが無効または期限切れです（invalid_grant）。');
		}

		if (record.clientId !== input.clientId) {
			throw new BadRequestException('client_id が認可コードと一致しません（invalid_grant）。');
		}

		if (record.redirectUri !== input.redirectUri) {
			throw new BadRequestException('redirect_uri が認可コードと一致しません（invalid_grant）。');
		}

		if (!this.verifyPkceS256(input.codeVerifier, record.codeChallenge)) {
			throw new BadRequestException(
				'code_verifier が code_challenge と一致しません（PKCE S256 検証失敗）。',
			);
		}

		const scopes = record.scope.split(' ').filter((s): s is McpScope => MCP_VALID_SCOPES.has(s));
		const accessToken = this.mintMcpAccessToken(record.userId, scopes, record.resource);
		const refreshToken = await this.createRefreshToken(
			record.clientId,
			record.userId,
			record.scope,
		);

		return { accessToken, refreshToken, expiresIn: 3600, scope: record.scope };
	}

	/**
	 * 4.4: リフレッシュトークン回転。
	 * 旧トークン失効 + 新トークン作成をトランザクション内で原子化（OAuth 2.1 public client MUST）。
	 */
	async exchangeRefreshToken(input: ExchangeRefreshInput): Promise<IssuedTokens> {
		const tokenHash = createHash('sha256').update(input.refreshToken).digest('hex');
		const record = await this.refreshStore.findByHash(tokenHash);

		if (!record) {
			throw new UnauthorizedException('リフレッシュトークンが無効です。');
		}
		if (record.revokedAt) {
			throw new UnauthorizedException('リフレッシュトークンは失効しています（revoked）。');
		}
		if (record.expiresAt.getTime() < Date.now()) {
			throw new UnauthorizedException('リフレッシュトークンが期限切れです。');
		}
		if (record.clientId !== input.clientId) {
			throw new BadRequestException('client_id がリフレッシュトークンと一致しません。');
		}

		const newPlain = randomBytes(32).toString('base64url');
		const newHash = createHash('sha256').update(newPlain).digest('hex');
		const newExpiresAt = new Date(Date.now() + MCP_REFRESH_TOKEN_TTL_MS);

		await this.refreshStore.rotate(record, newHash, newExpiresAt);

		const scopes = record.scope.split(' ').filter((s): s is McpScope => MCP_VALID_SCOPES.has(s));
		const accessToken = this.mintMcpAccessToken(record.userId, scopes, this.config.mcpCanonicalUrl);

		return { accessToken, refreshToken: newPlain, expiresIn: 3600, scope: record.scope };
	}

	/** MCP 専用 JWT を発行する。REST 用トークンとは token_use=mcp と aud で相互排他。 */
	private mintMcpAccessToken(userId: string, scopes: McpScope[], audience: string): string {
		return this.jwtService.sign(
			{
				sub: userId,
				aud: audience,
				scope: scopes.join(' '),
				token_use: 'mcp',
			},
			{ expiresIn: MCP_ACCESS_TOKEN_EXPIRATION },
		);
	}

	/** リフレッシュトークンを生成してハッシュ保存し、平文を返す。 */
	private async createRefreshToken(
		clientId: string,
		userId: string,
		scope: string,
	): Promise<string> {
		const plain = randomBytes(32).toString('base64url');
		const tokenHash = createHash('sha256').update(plain).digest('hex');
		const expiresAt = new Date(Date.now() + MCP_REFRESH_TOKEN_TTL_MS);

		await this.refreshStore.create({ tokenHash, clientId, userId, scope, expiresAt });
		return plain;
	}

	/** redirect_uri が許可されているかを検証する。localhost（http）または HTTPS のみ許可。 */
	private isAllowedRedirectUri(uri: string): boolean {
		try {
			const parsed = new URL(uri);
			if (parsed.protocol === 'https:') return true;
			if (
				parsed.protocol === 'http:' &&
				(parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
			) {
				return true;
			}
			return false;
		} catch {
			return false;
		}
	}
}

import * as http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import cookieSession from 'cookie-session';
import passport from 'passport';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import request from 'supertest';

/**
 * 互換ゲート（design.md Migration Strategy / Task 1.1）
 *
 * 採用方式の唯一の load-bearing 仮定:
 *   Express 5 × passport-oauth2 0.x × cookie-session の round-trip。
 *
 * passport-oauth2 が `state: true` / `pkce: true` で `req.session` に保存する
 * CSRF state と PKCE code_verifier が、cookie-session（署名付き Cookie）上で
 * 「ログイン開始 → コールバック」の別リクエスト間を往復し、復元・検証が通ることを検証する。
 *
 * これが GREEN なら Cookie 方式（サーバー側ストア不要・多インスタンス native）を採用できる。
 * RED（往復不成立）なら Option B（connect-pg-simple）へ切替する（research.md 参照）。
 */
describe('互換ゲート: passport-oauth2 × cookie-session の state/PKCE 往復（Express 5）', () => {
	let tokenServer: http.Server;
	let tokenUrl: string;
	const STRATEGY_NAME = 'x-gate';

	beforeAll((done) => {
		// X のトークンエンドポイントを模したローカルサーバー。
		// passport-oauth2 は code + code_verifier を POST してくるので access_token を返すだけ。
		tokenServer = http.createServer((req, res) => {
			let body = '';
			req.on('data', (chunk) => (body += chunk));
			req.on('end', () => {
				res.setHeader('Content-Type', 'application/json');
				res.end(JSON.stringify({ access_token: 'gate-access-token', token_type: 'bearer' }));
			});
		});
		tokenServer.listen(0, '127.0.0.1', () => {
			const { port } = tokenServer.address() as AddressInfo;
			tokenUrl = `http://127.0.0.1:${port}/token`;
			done();
		});
	});

	afterAll((done) => {
		passport.unuse(STRATEGY_NAME);
		tokenServer.close(done);
	});

	function buildApp(): express.Express {
		const strategy = new OAuth2Strategy(
			{
				authorizationURL: 'https://twitter.com/i/oauth2/authorize',
				tokenURL: tokenUrl,
				clientID: 'gate-client',
				clientSecret: 'gate-secret',
				callbackURL: 'http://127.0.0.1/auth/x/callback',
				pkce: true,
				state: true,
			},
			(accessToken: string, _refreshToken: string, _profile: unknown, verified) => {
				verified(null, { accessToken });
			},
		);
		passport.use(STRATEGY_NAME, strategy);

		const app = express();
		// 本番（main.ts）と同じく cookie-session（署名付き Cookie）でセッションを構成する。
		app.use(cookieSession({ name: 'mosaku.sid', keys: ['gate-session-secret'] }));
		app.use(passport.initialize());

		// req.login/serialize を使わない（session:false）= cookie-session が regenerate を実装しなくても成立する。
		app.get('/auth/x', passport.authenticate(STRATEGY_NAME, { session: false }));
		app.get(
			'/auth/x/callback',
			passport.authenticate(STRATEGY_NAME, { session: false, failureRedirect: '/fail' }),
			(req, res) => {
				res.status(200).json({ ok: true, user: req.user });
			},
		);
		return app;
	}

	it('開始で state/PKCE が Cookie に載り、別リクエストのコールバックで復元・検証が通ること', async () => {
		const agent = request.agent(buildApp());

		// 1. ログイン開始: twitter へ 302。state と code_challenge（PKCE）が付与される。
		const startRes = await agent.get('/auth/x').expect(302);
		const location = startRes.headers.location;
		const authorizeUrl = new URL(location);
		const state = authorizeUrl.searchParams.get('state');

		expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(
			'https://twitter.com/i/oauth2/authorize',
		);
		expect(state).toBeTruthy();
		expect(authorizeUrl.searchParams.get('code_challenge')).toBeTruthy();
		expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
		// 開始リクエストでセッション Cookie が発行される（state/verifier の格納先）。
		expect(startRes.headers['set-cookie']).toBeDefined();

		// 2. コールバック: 開始時に Cookie へ保存された state/verifier を復元して検証 → トークン交換成功。
		const callbackRes = await agent
			.get(`/auth/x/callback?code=gate-code&state=${state}`)
			.expect(200);

		expect(callbackRes.body.ok).toBe(true);
		expect(callbackRes.body.user).toEqual({ accessToken: 'gate-access-token' });
	});
});

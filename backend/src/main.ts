import './instrument';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from root .env (for local development)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Also try loading from parent of backend (monorepo root)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieSession from 'cookie-session';
import cookieParser from 'cookie-parser';
import { ConfigService } from './config/config.service';
import helmet from 'helmet';
import { ThrottlerExceptionFilter } from './common/filters/throttler-exception.filter';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	const configService = app.get(ConfigService);

	// セキュリティヘッダー設定（Helmet.js）
	app.use(
		helmet({
			contentSecurityPolicy: {
				directives: {
					defaultSrc: ["'self'"],
					styleSrc: ["'self'", "'unsafe-inline'"],
					scriptSrc: ["'self'"],
					imgSrc: ["'self'", 'data:', 'https:'],
				},
			},
			crossOriginEmbedderPolicy: false, // OAuth認証で必要
		}),
	);

	// Refresh Token Cookie の読み取りに必要（HttpOnly Cookie 経由で配送）
	app.use(cookieParser());

	// Session設定（X OAuth用）
	// 署名付き Cookie ベース（cookie-session）。サーバー側ストアを持たないため
	// Cloud Run の複数インスタンス・再起動でも session（X の CSRF state / PKCE verifier /
	// 招待コード）が消失しない。デフォルト MemoryStore（本番非推奨・メモリリーク源）を排除。
	// 適用順序は helmet → cookie-parser → cookie-session → CORS を維持する。
	const sessionCookie = configService.sessionCookieOptions;
	app.use(
		cookieSession({
			name: 'mosaku.sid',
			// 全インスタンス完全同一の単一署名鍵が多インスタンス耐性の前提（ConfigService.sessionSecret 参照）。
			keys: [configService.sessionSecret],
			secure: sessionCookie.secure, // 本番環境ではHTTPS必須
			httpOnly: sessionCookie.httpOnly, // XSS対策
			sameSite: sessionCookie.sameSite, // CSRF対策・クロスオリジン整合（env 上書き可）
			maxAge: sessionCookie.maxAge, // OAuth フロー完了に十分な範囲（既定 10 分）
		}),
	);

	// CORS設定（環境変数から読み込み）
	app.enableCors({
		origin: configService.corsOrigins,
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
		credentials: true,
	});

	// グローバルバリデーションパイプ（DTO変換・不要プロパティ除去）
	app.useGlobalPipes(
		new ValidationPipe({
			transform: true,
			whitelist: true,
			forbidNonWhitelisted: false,
		}),
	);

	// レート制限エラーのカスタムフィルター
	app.useGlobalFilters(new ThrottlerExceptionFilter());

	// リバースプロキシ（GCLB / Cloud Run）配下で正しい接続元 IP を解決する
	app.getHttpAdapter().getInstance().set('trust proxy', 1);

	await app.listen(configService.port);
}
void bootstrap();

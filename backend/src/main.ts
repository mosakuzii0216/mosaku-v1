import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as session from 'express-session';
import { ConfigService } from './config/config.service';
import helmet from 'helmet';

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

	// Session設定（X OAuth用）
	app.use(
		session({
			secret: configService.sessionSecret,
			resave: false,
			saveUninitialized: false,
			cookie: {
				secure: configService.isProduction, // 本番環境ではHTTPS必須
				httpOnly: true, // XSS対策
				sameSite: 'lax', // CSRF対策
				maxAge: 1000 * 60 * 60, // 1時間
			},
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

	await app.listen(configService.port);
}
void bootstrap();

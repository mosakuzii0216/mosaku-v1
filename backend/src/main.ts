import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as session from 'express-session';
import { ConfigService } from './config/config.service';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	const configService = app.get(ConfigService);

	// Session設定（X OAuth用）
	app.use(
		session({
			secret: configService.sessionSecret,
			resave: false,
			saveUninitialized: false,
			cookie: {
				secure: false, // HTTPSでない場合はfalse
				maxAge: 1000 * 60 * 60, // 1時間
			},
		}),
	);

	// CORS設定
	app.enableCors({
		origin: ['http://localhost:5173', 'http://localhost:80', 'http://localhost'],
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

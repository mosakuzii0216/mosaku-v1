import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';

import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { SentryUserContextInterceptor } from './common/sentry/sentry-user-context.interceptor';

interface ProviderEntry {
	provide?: unknown;
	useClass?: unknown;
}

describe('AppModule providers metadata', () => {
	const providers = (Reflect.getMetadata('providers', AppModule) ?? []) as ProviderEntry[];

	const findByToken = (token: unknown): ProviderEntry | undefined =>
		providers.find((p): p is ProviderEntry => !!p && typeof p === 'object' && p.provide === token);

	const findAllByToken = (token: unknown): ProviderEntry[] =>
		providers.filter(
			(p): p is ProviderEntry => !!p && typeof p === 'object' && p.provide === token,
		);

	it('SentryGlobalFilter が APP_FILTER として登録されていること（既存仕様の回帰防止）', () => {
		const provider = findByToken(APP_FILTER);
		expect(provider).toBeDefined();
		expect(provider?.useClass).toBe(SentryGlobalFilter);
	});

	it('ThrottlerGuard が APP_GUARD として登録されていること（既存仕様の回帰防止）', () => {
		const guards = findAllByToken(APP_GUARD).map((g) => g.useClass);
		expect(guards).toContain(ThrottlerGuard);
	});

	it('JwtAuthGuard が APP_GUARD としてグローバル化されていること（@Public() opt-out 方式）', () => {
		const guards = findAllByToken(APP_GUARD).map((g) => g.useClass);
		expect(guards).toContain(JwtAuthGuard);
	});

	it('SentryUserContextInterceptor が APP_INTERCEPTOR としてグローバル登録されていること', () => {
		const provider = findByToken(APP_INTERCEPTOR);
		expect(provider).toBeDefined();
		expect(provider?.useClass).toBe(SentryUserContextInterceptor);
	});
});

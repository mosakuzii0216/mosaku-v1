import 'reflect-metadata';
import { AuthModule } from './auth.module';
import { AppleStrategy } from './apple.strategy';
import { AppleAuthGuard } from './oauth-auth.guards';
import { RefreshTokenRepository } from './refresh-token.repository';
import { RefreshTokenService } from './refresh-token.service';

describe('AuthModule - プロバイダー登録', () => {
	const providers = (Reflect.getMetadata('providers', AuthModule) as unknown[]) ?? [];
	const exports = (Reflect.getMetadata('exports', AuthModule) as unknown[]) ?? [];

	it('AppleStrategy が providers に登録されていること', () => {
		expect(providers).toContain(AppleStrategy);
	});

	it('AppleAuthGuard が providers に登録されていること', () => {
		expect(providers).toContain(AppleAuthGuard);
	});

	it('AppleAuthGuard が exports に登録されていること', () => {
		expect(exports).toContain(AppleAuthGuard);
	});

	it('RefreshTokenRepository が providers / exports に登録されていること', () => {
		expect(providers).toContain(RefreshTokenRepository);
		expect(exports).toContain(RefreshTokenRepository);
	});

	it('RefreshTokenService が providers / exports に登録されていること', () => {
		expect(providers).toContain(RefreshTokenService);
		expect(exports).toContain(RefreshTokenService);
	});
});

describe('AuthModule - 廃止プロバイダ（LINE / GitHub）の DI 除去', () => {
	const providers = (Reflect.getMetadata('providers', AuthModule) as unknown[]) ?? [];
	const providerNames = providers.map((p) =>
		typeof p === 'function' ? p.name : JSON.stringify(p),
	);

	it('LineStrategy / GitHubStrategy / LineAuthGuard / GitHubAuthGuard を含まないこと', () => {
		expect(providerNames).not.toEqual(
			expect.arrayContaining([
				'LineStrategy',
				'GitHubStrategy',
				'LineAuthGuard',
				'GitHubAuthGuard',
			]),
		);
	});
});

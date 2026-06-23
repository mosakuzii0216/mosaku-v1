import 'reflect-metadata';
import { AuthModule } from './auth.module';
import { LineStrategy } from './line.strategy';
import { AppleStrategy } from './apple.strategy';
import { LineAuthGuard, AppleAuthGuard } from './oauth-auth.guards';
import { RefreshTokenRepository } from './refresh-token.repository';
import { RefreshTokenService } from './refresh-token.service';

describe('AuthModule - プロバイダー登録', () => {
	const providers = (Reflect.getMetadata('providers', AuthModule) as unknown[]) ?? [];
	const exports = (Reflect.getMetadata('exports', AuthModule) as unknown[]) ?? [];

	it('LineStrategy が providers に登録されていること', () => {
		expect(providers).toContain(LineStrategy);
	});

	it('AppleStrategy が providers に登録されていること', () => {
		expect(providers).toContain(AppleStrategy);
	});

	it('LineAuthGuard が providers に登録されていること', () => {
		expect(providers).toContain(LineAuthGuard);
	});

	it('AppleAuthGuard が providers に登録されていること', () => {
		expect(providers).toContain(AppleAuthGuard);
	});

	it('LineAuthGuard が exports に登録されていること', () => {
		expect(exports).toContain(LineAuthGuard);
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

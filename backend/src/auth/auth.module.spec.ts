import 'reflect-metadata';
import { AuthModule } from './auth.module';
import { LineStrategy } from './line.strategy';
import { AppleStrategy } from './apple.strategy';
import { XStrategy } from './x.strategy';
import { LineAuthGuard, AppleAuthGuard, XAuthGuard } from './oauth-auth.guards';

describe('AuthModule - 新プロバイダー登録', () => {
	const providers: unknown[] = Reflect.getMetadata('providers', AuthModule) ?? [];
	const exports: unknown[] = Reflect.getMetadata('exports', AuthModule) ?? [];

	it('LineStrategy が providers に登録されていること', () => {
		expect(providers).toContain(LineStrategy);
	});

	it('AppleStrategy が providers に登録されていること', () => {
		expect(providers).toContain(AppleStrategy);
	});

	it('XStrategy が providers に登録されていること', () => {
		expect(providers).toContain(XStrategy);
	});

	it('LineAuthGuard が providers に登録されていること', () => {
		expect(providers).toContain(LineAuthGuard);
	});

	it('AppleAuthGuard が providers に登録されていること', () => {
		expect(providers).toContain(AppleAuthGuard);
	});

	it('XAuthGuard が providers に登録されていること', () => {
		expect(providers).toContain(XAuthGuard);
	});

	it('LineAuthGuard が exports に登録されていること', () => {
		expect(exports).toContain(LineAuthGuard);
	});

	it('AppleAuthGuard が exports に登録されていること', () => {
		expect(exports).toContain(AppleAuthGuard);
	});

	it('XAuthGuard が exports に登録されていること', () => {
		expect(exports).toContain(XAuthGuard);
	});
});

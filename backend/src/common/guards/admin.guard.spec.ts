import { ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AppException } from '../exceptions';

describe('AdminGuard', () => {
	let guard: AdminGuard;

	const createMockContext = (user?: { role?: string }): ExecutionContext =>
		({
			switchToHttp: () => ({
				getRequest: () => ({ user }),
			}),
		}) as unknown as ExecutionContext;

	beforeEach(() => {
		guard = new AdminGuard();
	});

	it('should be defined', () => {
		expect(guard).toBeDefined();
	});

	it('should return true for ADMIN user', () => {
		const context = createMockContext({ role: 'ADMIN' });

		expect(guard.canActivate(context)).toBe(true);
	});

	it('should throw AppException for USER user', () => {
		const context = createMockContext({ role: 'USER' });

		expect(() => guard.canActivate(context)).toThrow(AppException);
	});

	it('should throw AppException when user is undefined', () => {
		const context = createMockContext(undefined);

		expect(() => guard.canActivate(context)).toThrow(AppException);
	});

	it('should throw AppException when user has no role', () => {
		const context = createMockContext({});

		expect(() => guard.canActivate(context)).toThrow(AppException);
	});
});

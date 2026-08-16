import { describe, it, expect } from 'vitest';
import { ApiError, isApiError } from './apiError';

describe('ApiError', () => {
	it('code / statusCode / message を保持する Error 派生クラスである', () => {
		const err = new ApiError({ code: 'INV001', message: '招待コードが無効です', statusCode: 400 });
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(ApiError);
		expect(err.code).toBe('INV001');
		expect(err.statusCode).toBe(400);
		expect(err.message).toBe('招待コードが無効です');
	});

	it('code が無いレスポンスでも生成可能（code は null）', () => {
		const err = new ApiError({ message: 'HTTP error! status: 503', statusCode: 503 });
		expect(err.code).toBeNull();
		expect(err.statusCode).toBe(503);
	});

	it('name は "ApiError" 固定', () => {
		const err = new ApiError({ message: 'x', statusCode: 400 });
		expect(err.name).toBe('ApiError');
	});
});

describe('isApiError', () => {
	it('ApiError インスタンスのみ true を返す', () => {
		expect(isApiError(new ApiError({ message: 'x', statusCode: 400 }))).toBe(true);
		expect(isApiError(new Error('x'))).toBe(false);
		expect(isApiError('string')).toBe(false);
		expect(isApiError(null)).toBe(false);
		expect(isApiError(undefined)).toBe(false);
	});
});

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenService } from './jwt.service';

describe('JwtTokenService', () => {
	let service: JwtTokenService;

	const mockJwtService = {
		sign: jest.fn().mockReturnValue('mock-jwt-token'),
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				JwtTokenService,
				{ provide: JwtService, useValue: mockJwtService },
			],
		}).compile();

		service = module.get<JwtTokenService>(JwtTokenService);
		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('generateTokens', () => {
		it('should return an accessToken', () => {
			mockJwtService.sign.mockReturnValue('generated-token');

			const result = service.generateTokens('user-id', 'user@example.com', 'FREE');

			expect(result.accessToken).toBe('generated-token');
		});

		it('should sign JWT with correct payload (sub, email, role)', () => {
			service.generateTokens('user-id-123', 'user@example.com', 'ADMIN');

			expect(mockJwtService.sign).toHaveBeenCalledWith(
				expect.objectContaining({
					sub: 'user-id-123',
					email: 'user@example.com',
					role: 'ADMIN',
				}),
				expect.any(Object),
			);
		});

		it('should call sign once per generateTokens call', () => {
			service.generateTokens('id', 'email@example.com', 'FREE');

			expect(mockJwtService.sign).toHaveBeenCalledTimes(1);
		});
	});
});

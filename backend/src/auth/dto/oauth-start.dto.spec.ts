import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { OAuthStartParamsDto, OAUTH_START_PROVIDERS } from './oauth-start.dto';

describe('OAUTH_START_PROVIDERS', () => {
	it('有効3プロバイダ（google/x/apple）に縮約されていること', () => {
		expect(OAUTH_START_PROVIDERS).toEqual(['google', 'x', 'apple']);
	});
});

describe('OAuthStartParamsDto - provider バリデーション', () => {
	it.each(OAUTH_START_PROVIDERS)(
		'%s は有効な provider として受理される（バリデーションエラーなし）',
		async (provider) => {
			const dto = plainToInstance(OAuthStartParamsDto, { provider });
			const errors = await validate(dto);
			expect(errors).toHaveLength(0);
		},
	);

	it.each(['github', 'line'])(
		'%s は廃止プロバイダのためバリデーションエラー（400 相当）になる',
		async (provider) => {
			const dto = plainToInstance(OAuthStartParamsDto, { provider });
			const errors = await validate(dto);
			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0].constraints).toHaveProperty('isIn');
		},
	);
});

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateMemoDto } from './update-memo.dto';

describe('UpdateMemoDto', () => {
	describe('clientUpdatedAt', () => {
		it('未指定時はバリデーションを通過する', async () => {
			const dto = plainToInstance(UpdateMemoDto, { title: 'updated' });
			const errors = await validate(dto);
			expect(errors).toHaveLength(0);
		});

		it('UTC ISO8601 (Z 終端) は通過する', async () => {
			const dto = plainToInstance(UpdateMemoDto, {
				clientUpdatedAt: '2026-05-10T12:34:56.789Z',
			});
			const errors = await validate(dto);
			expect(errors).toHaveLength(0);
		});

		it('オフセット付き ISO8601 (+09:00) は通過する', async () => {
			const dto = plainToInstance(UpdateMemoDto, {
				clientUpdatedAt: '2026-05-10T21:34:56+09:00',
			});
			const errors = await validate(dto);
			expect(errors).toHaveLength(0);
		});

		it('タイムゾーン情報が欠落した ISO8601 はバリデーションエラーになる', async () => {
			const dto = plainToInstance(UpdateMemoDto, {
				clientUpdatedAt: '2026-05-10T12:34:56',
			});
			const errors = await validate(dto);
			expect(errors.some((e) => e.property === 'clientUpdatedAt')).toBe(true);
		});

		it('日付のみ (YYYY-MM-DD) の文字列もエラーになる', async () => {
			const dto = plainToInstance(UpdateMemoDto, {
				clientUpdatedAt: '2026-05-10',
			});
			const errors = await validate(dto);
			expect(errors.some((e) => e.property === 'clientUpdatedAt')).toBe(true);
		});

		it('ISO8601 ではない任意文字列はエラーになる', async () => {
			const dto = plainToInstance(UpdateMemoDto, {
				clientUpdatedAt: 'not-a-date',
			});
			const errors = await validate(dto);
			expect(errors.some((e) => e.property === 'clientUpdatedAt')).toBe(true);
		});

		it('既存フィールド (title / content / notebookId) のバリデーションは維持される', async () => {
			const dto = plainToInstance(UpdateMemoDto, {
				title: 'A'.repeat(101), // MaxLength(100) 違反
			});
			const errors = await validate(dto);
			expect(errors.some((e) => e.property === 'title')).toBe(true);
		});
	});
});

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateNotebookDto } from './create-notebook.dto';

const validDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

describe('CreateNotebookDto', () => {
	it('should be defined', () => {
		expect(new CreateNotebookDto()).toBeDefined();
	});

	describe('content - ProseMirrorDoc 検証', () => {
		it('有効な ProseMirrorDoc は通過する', async () => {
			const dto = plainToInstance(CreateNotebookDto, { content: validDoc });
			expect((await validate(dto)).filter((e) => e.property === 'content')).toHaveLength(0);
		});

		it('null content は通過する（nullable）', async () => {
			const dto = plainToInstance(CreateNotebookDto, { content: null });
			expect((await validate(dto)).filter((e) => e.property === 'content')).toHaveLength(0);
		});

		it('content 未指定は通過する', async () => {
			const dto = plainToInstance(CreateNotebookDto, {});
			expect((await validate(dto)).filter((e) => e.property === 'content')).toHaveLength(0);
		});

		it('文字列 content はエラーになる', async () => {
			const dto = plainToInstance(CreateNotebookDto, { content: '<p>html</p>' });
			const errors = await validate(dto);
			expect(errors.some((e) => e.property === 'content')).toBe(true);
		});

		it('type が "doc" 以外はエラーになる', async () => {
			const dto = plainToInstance(CreateNotebookDto, { content: { type: 'paragraph' } });
			const errors = await validate(dto);
			expect(errors.some((e) => e.property === 'content')).toBe(true);
		});
	});
});

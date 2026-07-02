import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateMemoDto } from './create-memo.dto';
import { createEmptyDoc } from '../../common/utils/prosemirror-types';

const validDoc = {
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
};

describe('CreateMemoDto - content ProseMirrorDoc 検証', () => {
	it('有効な ProseMirrorDoc は通過する', async () => {
		const dto = plainToInstance(CreateMemoDto, { title: 'Test', content: validDoc });
		expect(await validate(dto)).toHaveLength(0);
	});

	it('空 doc は通過する', async () => {
		const dto = plainToInstance(CreateMemoDto, { title: 'Test', content: createEmptyDoc() });
		expect(await validate(dto)).toHaveLength(0);
	});

	it('文字列 content はエラーになる', async () => {
		const dto = plainToInstance(CreateMemoDto, { title: 'Test', content: '<p>html</p>' });
		const errors = await validate(dto);
		expect(errors.some((e) => e.property === 'content')).toBe(true);
	});

	it('type が "doc" 以外のオブジェクトはエラーになる', async () => {
		const dto = plainToInstance(CreateMemoDto, {
			title: 'Test',
			content: { type: 'paragraph', content: [] },
		});
		const errors = await validate(dto);
		expect(errors.some((e) => e.property === 'content')).toBe(true);
	});

	it('content が配列はエラーになる', async () => {
		const dto = plainToInstance(CreateMemoDto, { title: 'Test', content: [] });
		const errors = await validate(dto);
		expect(errors.some((e) => e.property === 'content')).toBe(true);
	});

	it('content が null はエラーになる（Memo は non-null）', async () => {
		const dto = plainToInstance(CreateMemoDto, { title: 'Test', content: null });
		const errors = await validate(dto);
		expect(errors.some((e) => e.property === 'content')).toBe(true);
	});
});

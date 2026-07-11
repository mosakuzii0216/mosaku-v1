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

	// rich-editor-blocks Task 9.4: 4機能（コールアウト・テキスト色/マーカー・表・トグル）の
	// ノード/マークを含む本文 JSON も、既存の JSONB カラム・既存バリデーションの枠組みの
	// ままで受理されることを固定する（Req9.1・DB スキーマ変更なし）。
	it('4機能（コールアウト・テキスト色/マーカー・表・トグル）を含む本文 JSON は通過する（Req9.1）', async () => {
		const richDoc = {
			type: 'doc',
			content: [
				{
					type: 'callout',
					attrs: { variant: 'warning' },
					content: [
						{
							type: 'paragraph',
							content: [
								{
									type: 'text',
									text: '装飾済み',
									marks: [
										{ type: 'textStyle', attrs: { textColor: 'sumire' } },
										{ type: 'highlight', attrs: { marker: 'kiiro' } },
									],
								},
							],
						},
					],
				},
				{
					type: 'table',
					content: [
						{
							type: 'tableRow',
							content: [
								{
									type: 'tableCell',
									content: [{ type: 'paragraph', content: [{ type: 'text', text: 'セル' }] }],
								},
							],
						},
					],
				},
				{
					type: 'details',
					content: [
						{ type: 'detailsSummary', content: [{ type: 'text', text: 'サマリー' }] },
						{
							type: 'detailsContent',
							content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文' }] }],
						},
					],
				},
			],
		};
		const dto = plainToInstance(CreateMemoDto, { title: 'Test', content: richDoc });
		expect(await validate(dto)).toHaveLength(0);
	});
});

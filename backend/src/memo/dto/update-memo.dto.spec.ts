import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateMemoDto } from './update-memo.dto';

const validDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

describe('UpdateMemoDto', () => {
	describe('content - ProseMirrorDoc 検証', () => {
		it('有効な ProseMirrorDoc は通過する', async () => {
			const dto = plainToInstance(UpdateMemoDto, { content: validDoc });
			expect((await validate(dto)).filter((e) => e.property === 'content')).toHaveLength(0);
		});

		it('content 未指定（undefined）は通過する', async () => {
			const dto = plainToInstance(UpdateMemoDto, { title: 'updated' });
			expect((await validate(dto)).filter((e) => e.property === 'content')).toHaveLength(0);
		});

		it('文字列 content はエラーになる', async () => {
			const dto = plainToInstance(UpdateMemoDto, { content: '<p>html</p>' });
			const errors = await validate(dto);
			expect(errors.some((e) => e.property === 'content')).toBe(true);
		});

		it('type が "doc" 以外はエラーになる', async () => {
			const dto = plainToInstance(UpdateMemoDto, { content: { type: 'paragraph' } });
			const errors = await validate(dto);
			expect(errors.some((e) => e.property === 'content')).toBe(true);
		});

		// rich-editor-blocks Task 9.4: 自動保存（PATCH）経路でも4機能を含む本文 JSON が
		// 既存バリデーションの枠組みのまま受理されることを固定する（Req9.1/9.2）。
		it('4機能（コールアウト・テキスト色/マーカー・表・トグル）を含む本文 JSON は通過する（Req9.1/9.2）', async () => {
			const richDoc = {
				type: 'doc',
				content: [
					{
						type: 'callout',
						attrs: { variant: 'point' },
						content: [
							{
								type: 'paragraph',
								content: [
									{
										type: 'text',
										text: '装飾済み',
										marks: [
											{ type: 'textStyle', attrs: { textColor: 'wakaba' } },
											{ type: 'highlight', attrs: { marker: 'mizu' } },
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
			const dto = plainToInstance(UpdateMemoDto, { content: richDoc });
			expect((await validate(dto)).filter((e) => e.property === 'content')).toHaveLength(0);
		});
	});

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

import { validate } from 'class-validator';
import {
	createEmptyDoc,
	isEmptyDoc,
	isProseMirrorDoc,
	IsProseMirrorDoc,
	type ProseMirrorDoc,
} from './prosemirror-types';

class StrictDto {
	@IsProseMirrorDoc()
	content: unknown;
}

class NullableDto {
	@IsProseMirrorDoc({ nullable: true })
	content: unknown;
}

describe('isProseMirrorDoc', () => {
	it('valid doc with content nodes', () => {
		expect(isProseMirrorDoc({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
	});

	it('valid doc with no content key', () => {
		expect(isProseMirrorDoc({ type: 'doc' })).toBe(true);
	});

	it('valid doc with empty content array', () => {
		expect(isProseMirrorDoc({ type: 'doc', content: [] })).toBe(true);
	});

	it('valid doc with nested content', () => {
		expect(
			isProseMirrorDoc({
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [{ type: 'text', text: 'hello' }],
					},
				],
			}),
		).toBe(true);
	});

	it('rejects null', () => {
		expect(isProseMirrorDoc(null)).toBe(false);
	});

	it('rejects undefined', () => {
		expect(isProseMirrorDoc(undefined)).toBe(false);
	});

	it('rejects string', () => {
		expect(isProseMirrorDoc('<p>html</p>')).toBe(false);
	});

	it('rejects number', () => {
		expect(isProseMirrorDoc(42)).toBe(false);
	});

	it('rejects array', () => {
		expect(isProseMirrorDoc([])).toBe(false);
	});

	it('rejects when type is not doc', () => {
		expect(isProseMirrorDoc({ type: 'paragraph' })).toBe(false);
		expect(isProseMirrorDoc({ type: 'heading' })).toBe(false);
	});

	it('rejects when content is not an array', () => {
		expect(isProseMirrorDoc({ type: 'doc', content: 'not-array' })).toBe(false);
		expect(isProseMirrorDoc({ type: 'doc', content: {} })).toBe(false);
	});

	it('rejects when a content node has no type', () => {
		expect(isProseMirrorDoc({ type: 'doc', content: [{ text: 'orphan' }] })).toBe(false);
	});

	it('rejects when a content node type is not a string', () => {
		expect(isProseMirrorDoc({ type: 'doc', content: [{ type: 123 }] })).toBe(false);
	});

	// rich-editor-blocks Task 9.4: 4機能（コールアウト・テキスト色/マーカー・表・トグル）の
	// ノード/マークを含む doc も、ノードタイプのホワイトリストを持たない現行実装のまま
	// 受理されることを固定する（Req9.1・DB スキーマ変更なし）。
	it('accepts a doc containing callout / table / details / semantic text-color & marker nodes', () => {
		expect(
			isProseMirrorDoc({
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
			}),
		).toBe(true);
	});
});

describe('isEmptyDoc', () => {
	it('empty doc from createEmptyDoc is empty', () => {
		expect(isEmptyDoc(createEmptyDoc())).toBe(true);
	});

	it('doc with no content key is empty', () => {
		expect(isEmptyDoc({ type: 'doc' })).toBe(true);
	});

	it('doc with empty content array is empty', () => {
		expect(isEmptyDoc({ type: 'doc', content: [] })).toBe(true);
	});

	it('doc with single empty paragraph is empty', () => {
		expect(isEmptyDoc({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
	});

	it('doc with paragraph with empty content array is empty', () => {
		expect(isEmptyDoc({ type: 'doc', content: [{ type: 'paragraph', content: [] }] })).toBe(true);
	});

	it('doc with text content is not empty', () => {
		const doc: ProseMirrorDoc = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
		};
		expect(isEmptyDoc(doc)).toBe(false);
	});

	it('doc with multiple nodes is not empty', () => {
		const doc: ProseMirrorDoc = {
			type: 'doc',
			content: [{ type: 'paragraph' }, { type: 'paragraph' }],
		};
		expect(isEmptyDoc(doc)).toBe(false);
	});

	it('doc with a non-paragraph single node is not empty', () => {
		const doc: ProseMirrorDoc = {
			type: 'doc',
			content: [{ type: 'heading', content: [{ type: 'text', text: 'Title' }] }],
		};
		expect(isEmptyDoc(doc)).toBe(false);
	});
});

describe('createEmptyDoc', () => {
	it('returns correct shape', () => {
		expect(createEmptyDoc()).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
	});

	it('passes isProseMirrorDoc', () => {
		expect(isProseMirrorDoc(createEmptyDoc())).toBe(true);
	});

	it('passes isEmptyDoc', () => {
		expect(isEmptyDoc(createEmptyDoc())).toBe(true);
	});

	it('returns a new object each call', () => {
		expect(createEmptyDoc()).not.toBe(createEmptyDoc());
	});
});

describe('IsProseMirrorDoc decorator (strict)', () => {
	it('passes for valid doc', async () => {
		const dto = new StrictDto();
		dto.content = { type: 'doc', content: [{ type: 'paragraph' }] };
		const errors = await validate(dto);
		expect(errors).toHaveLength(0);
	});

	it('passes for empty doc', async () => {
		const dto = new StrictDto();
		dto.content = createEmptyDoc();
		const errors = await validate(dto);
		expect(errors).toHaveLength(0);
	});

	it('fails for null', async () => {
		const dto = new StrictDto();
		dto.content = null;
		const errors = await validate(dto);
		expect(errors.length).toBeGreaterThan(0);
	});

	it('fails for HTML string', async () => {
		const dto = new StrictDto();
		dto.content = '<p>html</p>';
		const errors = await validate(dto);
		expect(errors.length).toBeGreaterThan(0);
	});

	it('fails for non-doc type', async () => {
		const dto = new StrictDto();
		dto.content = { type: 'paragraph' };
		const errors = await validate(dto);
		expect(errors.length).toBeGreaterThan(0);
	});

	it('error message mentions the property name', async () => {
		const dto = new StrictDto();
		dto.content = 'bad';
		const errors = await validate(dto);
		expect(errors[0]?.property).toBe('content');
	});
});

describe('IsProseMirrorDoc decorator (nullable)', () => {
	it('passes for null when nullable:true', async () => {
		const dto = new NullableDto();
		dto.content = null;
		const errors = await validate(dto);
		expect(errors).toHaveLength(0);
	});

	it('passes for undefined when nullable:true', async () => {
		const dto = new NullableDto();
		dto.content = undefined;
		const errors = await validate(dto);
		expect(errors).toHaveLength(0);
	});

	it('passes for valid doc when nullable:true', async () => {
		const dto = new NullableDto();
		dto.content = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
		};
		const errors = await validate(dto);
		expect(errors).toHaveLength(0);
	});

	it('fails for invalid value when nullable:true', async () => {
		const dto = new NullableDto();
		dto.content = '<p>html</p>';
		const errors = await validate(dto);
		expect(errors.length).toBeGreaterThan(0);
	});
});

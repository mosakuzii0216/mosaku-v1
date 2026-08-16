import { extractPlainText } from './prosemirror-text';
import type { ProseMirrorDoc } from './prosemirror-types';

// ゴールデンベクタ: 見出し/リスト/チェック/コード/引用/リンク/装飾の混在
// frontend/src/utils/editor/prosemirrorText.test.ts と同一構造・同一期待値で front/back 一致を保証する
export const GOLDEN_DOC: ProseMirrorDoc = {
	type: 'doc',
	content: [
		{
			type: 'heading',
			attrs: { level: 1 },
			content: [{ type: 'text', text: 'Golden Vector' }],
		},
		{
			type: 'paragraph',
			content: [
				{ type: 'text', text: 'Normal ' },
				{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
				{ type: 'text', text: ' and ' },
				{ type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
			],
		},
		{
			type: 'bulletList',
			content: [
				{
					type: 'listItem',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'List item 1' }] }],
				},
				{
					type: 'listItem',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'List item 2' }] }],
				},
			],
		},
		{
			type: 'taskList',
			content: [
				{
					type: 'taskItem',
					attrs: { checked: true },
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Done task' }] }],
				},
				{
					type: 'taskItem',
					attrs: { checked: false },
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pending task' }] }],
				},
			],
		},
		{
			type: 'codeBlock',
			attrs: { language: 'typescript' },
			content: [{ type: 'text', text: 'const x = 1;' }],
		},
		{
			type: 'blockquote',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A quote' }] }],
		},
		{
			type: 'paragraph',
			content: [
				{
					type: 'text',
					text: 'Link text',
					marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
				},
			],
		},
	],
};

export const GOLDEN_EXPECTED =
	'Golden Vector Normal bold and italic List item 1 List item 2 Done task Pending task const x = 1; A quote Link text';

describe('extractPlainText', () => {
	describe('null / undefined / empty cases', () => {
		it('null → empty string', () => {
			expect(extractPlainText(null)).toBe('');
		});

		it('undefined → empty string', () => {
			expect(extractPlainText(undefined)).toBe('');
		});

		it('doc with no content key → empty string', () => {
			expect(extractPlainText({ type: 'doc' })).toBe('');
		});

		it('doc with empty content array → empty string', () => {
			expect(extractPlainText({ type: 'doc', content: [] })).toBe('');
		});

		it('doc with single empty paragraph → empty string', () => {
			expect(extractPlainText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('');
		});

		it('doc with paragraph containing empty content array → empty string', () => {
			expect(extractPlainText({ type: 'doc', content: [{ type: 'paragraph', content: [] }] })).toBe(
				'',
			);
		});
	});

	describe('text extraction', () => {
		it('single paragraph with text', () => {
			const doc: ProseMirrorDoc = {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
			};
			expect(extractPlainText(doc)).toBe('Hello world');
		});

		it('multiple text nodes in same paragraph concatenate without extra space', () => {
			const doc: ProseMirrorDoc = {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{ type: 'text', text: 'Hello' },
							{ type: 'text', text: ' ' },
							{ type: 'text', text: 'world' },
						],
					},
				],
			};
			expect(extractPlainText(doc)).toBe('Hello world');
		});

		it('decorated inline text (bold, italic) produces no extra spaces', () => {
			const doc: ProseMirrorDoc = {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{ type: 'text', text: 'before ' },
							{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
							{ type: 'text', text: ' after' },
						],
					},
				],
			};
			expect(extractPlainText(doc)).toBe('before bold after');
		});
	});

	describe('block boundary spacing', () => {
		it('two paragraphs are separated by a single space', () => {
			const doc: ProseMirrorDoc = {
				type: 'doc',
				content: [
					{ type: 'paragraph', content: [{ type: 'text', text: 'Para 1' }] },
					{ type: 'paragraph', content: [{ type: 'text', text: 'Para 2' }] },
				],
			};
			expect(extractPlainText(doc)).toBe('Para 1 Para 2');
		});

		it('heading and paragraph are separated by a single space', () => {
			const doc: ProseMirrorDoc = {
				type: 'doc',
				content: [
					{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
					{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
				],
			};
			expect(extractPlainText(doc)).toBe('Title Body');
		});

		it('list items are separated by spaces', () => {
			const doc: ProseMirrorDoc = {
				type: 'doc',
				content: [
					{
						type: 'bulletList',
						content: [
							{
								type: 'listItem',
								content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
							},
							{
								type: 'listItem',
								content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }],
							},
						],
					},
				],
			};
			expect(extractPlainText(doc)).toBe('A B');
		});
	});

	describe('no structural keys in output', () => {
		it('does not include "type", "paragraph", "text" as literal strings', () => {
			const result = extractPlainText(GOLDEN_DOC);
			expect(result).not.toContain('"type"');
			expect(result).not.toContain('paragraph');
			expect(result).not.toContain('listItem');
			expect(result).not.toContain('attrs');
		});
	});

	describe('hardBreak', () => {
		it('hardBreak within paragraph inserts a space to prevent word fusion', () => {
			const doc: ProseMirrorDoc = {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{ type: 'text', text: 'Line 1' },
							{ type: 'hardBreak' },
							{ type: 'text', text: 'Line 2' },
						],
					},
				],
			};
			expect(extractPlainText(doc)).toBe('Line 1 Line 2');
		});
	});

	describe('determinism', () => {
		it('same input always produces same output', () => {
			const first = extractPlainText(GOLDEN_DOC);
			const second = extractPlainText(GOLDEN_DOC);
			expect(first).toBe(second);
		});
	});

	describe('golden vector', () => {
		it('matches expected output for all mixed node types', () => {
			expect(extractPlainText(GOLDEN_DOC)).toBe(GOLDEN_EXPECTED);
		});
	});
});

/**
 * rich-editor-blocks Task 9.2: コールアウト・表・トグルのノード内テキストが平文抽出結果
 * （検索・一覧プレビュー等）に含まれることを固定する（Req7.1/7.3〜7.6）。
 * frontend/src/utils/editor/prosemirrorText.test.ts と同一構造・同一期待値の担保テスト。
 */
describe('extractPlainText — 4機能ノードの追随（Task 9.2 / Req7.1, 7.3〜7.6）', () => {
	it('コールアウト本文のテキストが抽出結果に含まれる（Req7.1/7.3）', () => {
		const doc: ProseMirrorDoc = {
			type: 'doc',
			content: [
				{
					type: 'callout',
					attrs: { variant: 'warning' },
					content: [{ type: 'paragraph', content: [{ type: 'text', text: '注意事項です' }] }],
				},
			],
		};
		expect(extractPlainText(doc)).toBe('注意事項です');
	});

	it('コールアウトの variant 属性が表示テキストとして混入しない（Req7.6）', () => {
		const doc: ProseMirrorDoc = {
			type: 'doc',
			content: [
				{
					type: 'callout',
					attrs: { variant: 'warning' },
					content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文' }] }],
				},
			],
		};
		expect(extractPlainText(doc)).not.toContain('warning');
	});

	it('表のセルのテキストが抽出結果に含まれる（Req7.1/7.3）', () => {
		const doc: ProseMirrorDoc = {
			type: 'doc',
			content: [
				{
					type: 'table',
					content: [
						{
							type: 'tableRow',
							content: [
								{
									type: 'tableHeader',
									content: [{ type: 'paragraph', content: [{ type: 'text', text: '見出し' }] }],
								},
								{
									type: 'tableCell',
									content: [{ type: 'paragraph', content: [{ type: 'text', text: 'セルの値' }] }],
								},
							],
						},
					],
				},
			],
		};
		const result = extractPlainText(doc);
		expect(result).toContain('見出し');
		expect(result).toContain('セルの値');
	});

	it('トグルのサマリー/本文のテキストが抽出結果に含まれる（Req7.1/7.3）', () => {
		const doc: ProseMirrorDoc = {
			type: 'doc',
			content: [
				{
					type: 'details',
					content: [
						{ type: 'detailsSummary', content: [{ type: 'text', text: 'サマリー行' }] },
						{
							type: 'detailsContent',
							content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文の内容' }] }],
						},
					],
				},
			],
		};
		const result = extractPlainText(doc);
		expect(result).toContain('サマリー行');
		expect(result).toContain('本文の内容');
	});

	it('閉じた状態で保存されたトグルの本文テキストも抽出対象に含まれる（Req7.4）', () => {
		const doc: ProseMirrorDoc = {
			type: 'doc',
			content: [
				{
					type: 'details',
					content: [
						{ type: 'detailsSummary', content: [{ type: 'text', text: '折りたたみ' }] },
						{
							type: 'detailsContent',
							content: [
								{
									type: 'paragraph',
									content: [{ type: 'text', text: '閉じていても検索できる本文' }],
								},
							],
						},
					],
				},
			],
		};
		expect(extractPlainText(doc)).toContain('閉じていても検索できる本文');
	});

	it('テキスト色/マーカー適用済みテキストが通常テキストと同様に抽出される（Req7.5）', () => {
		const doc: ProseMirrorDoc = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: '装飾済みテキスト',
							marks: [
								{ type: 'textStyle', attrs: { textColor: 'sumire' } },
								{ type: 'highlight', attrs: { marker: 'kiiro' } },
							],
						},
					],
				},
			],
		};
		expect(extractPlainText(doc)).toBe('装飾済みテキスト');
	});

	it('コールアウト・表・トグルを含む複合 doc からすべてのテキストが抽出される（Req7.1〜7.5 統合）', () => {
		const doc: ProseMirrorDoc = {
			type: 'doc',
			content: [
				{
					type: 'callout',
					attrs: { variant: 'point' },
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'コールアウト本文' }] }],
				},
				{
					type: 'table',
					content: [
						{
							type: 'tableRow',
							content: [
								{
									type: 'tableCell',
									content: [{ type: 'paragraph', content: [{ type: 'text', text: 'セル本文' }] }],
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
							content: [{ type: 'paragraph', content: [{ type: 'text', text: 'トグル本文' }] }],
						},
					],
				},
			],
		};
		const result = extractPlainText(doc);
		expect(result).toContain('コールアウト本文');
		expect(result).toContain('セル本文');
		expect(result).toContain('サマリー');
		expect(result).toContain('トグル本文');
	});
});

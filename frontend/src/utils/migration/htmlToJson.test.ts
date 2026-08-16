import { describe, it, expect } from 'vitest';
import { convertRecord, batchConvert, type RawRecord } from './htmlToJson';

describe('convertRecord', () => {
	it('通常のHTMLをJSONに変換し、contentTextを生成する', () => {
		const result = convertRecord({
			id: 'memo1',
			content: '<h1>タイトル</h1><p>本文テキスト</p>',
			type: 'memo',
		});

		expect(result.id).toBe('memo1');
		expect(result.error).toBeUndefined();
		expect(result.fallback).toBe(false);
		expect(result.contentJson).toBeDefined();
		expect(result.contentJson?.type).toBe('doc');
		expect(result.contentText).toContain('タイトル');
		expect(result.contentText).toContain('本文テキスト');
	});

	it('空文字列は空docに変換する', () => {
		const result = convertRecord({ id: 'memo1', content: '', type: 'memo' });

		expect(result.contentJson).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
		expect(result.contentText).toBe('');
		expect(result.fallback).toBe(false);
		expect(result.error).toBeUndefined();
	});

	it('空段落HTMLは空docに変換する', () => {
		const result = convertRecord({ id: 'memo1', content: '<p></p>', type: 'memo' });

		expect(result.contentJson).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
		expect(result.contentText).toBe('');
		expect(result.fallback).toBe(false);
	});

	it('空白のみの文字列は空docに変換する', () => {
		const result = convertRecord({ id: 'memo1', content: '   ', type: 'memo' });

		expect(result.contentJson).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
		expect(result.contentText).toBe('');
	});

	it('Notebook NULLはnullのまま維持する', () => {
		const result = convertRecord({ id: 'nb1', content: null, type: 'notebook' });

		expect(result.contentJson).toBeNull();
		expect(result.contentText).toBe('');
		expect(result.fallback).toBe(false);
		expect(result.error).toBeUndefined();
	});

	it('同一入力に対して冪等（決定的）な結果を返す', () => {
		const input: RawRecord = {
			id: 'memo1',
			content: '<h1>タイトル</h1><p>テスト</p>',
			type: 'memo',
		};

		const r1 = convertRecord(input);
		const r2 = convertRecord(input);

		expect(r1.contentJson).toEqual(r2.contentJson);
		expect(r1.contentText).toBe(r2.contentText);
	});

	it('見出し・リスト・コードブロック・チェックリスト・引用・装飾を含む複合HTMLを変換する', () => {
		const html = [
			'<h1>タイトル</h1>',
			'<p><strong>太字</strong>テキスト</p>',
			'<ul><li>箇条書き</li></ul>',
			'<ol><li>番号付き</li></ol>',
			'<ul data-type="taskList"><li data-type="taskItem" data-checked="false">タスク</li></ul>',
			'<pre><code class="language-typescript">const x = 1;</code></pre>',
			'<blockquote><p>引用</p></blockquote>',
		].join('');

		const result = convertRecord({ id: 'memo1', content: html, type: 'memo' });

		expect(result.error).toBeUndefined();
		expect(result.contentJson?.type).toBe('doc');
		expect(result.contentText).toContain('タイトル');
		expect(result.contentText).toContain('太字テキスト');
		expect(result.contentText).toContain('箇条書き');
		expect(result.contentText).toContain('番号付き');
		expect(result.contentText).toContain('タスク');
		expect(result.contentText).toContain('引用');
		expect(result.contentText).toContain('const x = 1;');
	});

	it('contentTextにJSON構造キー名（"type","paragraph"等）を含まない', () => {
		const result = convertRecord({
			id: 'memo1',
			content: '<p>テスト本文</p>',
			type: 'memo',
		});

		expect(result.contentText).not.toContain('"type"');
		expect(result.contentText).not.toContain('paragraph');
		expect(result.contentText).not.toContain('{"');
	});

	it('Memoの変換エラー時は空docフォールバックを設定し、エラーを記録する', () => {
		const result = convertRecord({ id: 'memo1', content: '<p>bad</p>', type: 'memo' }, () => {
			throw new Error('conversion failed');
		});

		expect(result.error).toBeDefined();
		expect(result.error).toContain('conversion failed');
		expect(result.fallback).toBe(true);
		expect(result.contentJson).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
		expect(result.id).toBe('memo1');
	});

	it('Notebookの変換エラー時はnullを維持し、エラーを記録する', () => {
		const result = convertRecord(
			{ id: 'nb1', content: '<p>Some HTML</p>', type: 'notebook' },
			() => {
				throw new Error('conversion failed');
			},
		);

		expect(result.error).toBeDefined();
		expect(result.fallback).toBe(true);
		expect(result.contentJson).toBeNull();
		expect(result.id).toBe('nb1');
	});
});

describe('batchConvert', () => {
	it('複数レコードを処理しstatsを返す', () => {
		const records: RawRecord[] = [
			{ id: '1', content: '<p>メモ1</p>', type: 'memo' },
			{ id: '2', content: '<p>メモ2</p>', type: 'memo' },
			{ id: 'nb1', content: null, type: 'notebook' },
		];

		const { results, stats } = batchConvert(records);

		expect(results).toHaveLength(3);
		expect(stats.total).toBe(3);
		expect(stats.nullKeptCount).toBe(1);
		expect(stats.fallbackCount).toBe(0);
		expect(stats.errorIds).toHaveLength(0);
	});

	it('エラーがあっても処理を継続する', () => {
		const records: RawRecord[] = [
			{ id: '1', content: '<p>正常</p>', type: 'memo' },
			{ id: '2', content: '<p>エラー</p>', type: 'memo' },
			{ id: '3', content: '<p>正常2</p>', type: 'memo' },
		];

		const stubDoc = {
			type: 'doc' as const,
			content: [{ type: 'paragraph', content: [{ type: 'text', text: '正常' }] }],
		};
		const { results, stats } = batchConvert(records, (html) => {
			if (html.includes('エラー')) throw new Error('test error');
			return stubDoc;
		});

		expect(results).toHaveLength(3);
		expect(stats.fallbackCount).toBe(1);
		expect(stats.errorIds).toContain('2');
		expect(results[1].error).toBeDefined();
		expect(results[0].error).toBeUndefined();
		expect(results[2].error).toBeUndefined();
	});

	it('空docとフォールバック件数をstatsに正確に反映する', () => {
		const records: RawRecord[] = [
			{ id: '1', content: '', type: 'memo' },
			{ id: '2', content: '<p>テキスト</p>', type: 'memo' },
			{ id: '3', content: null, type: 'notebook' },
		];

		const { stats } = batchConvert(records);

		expect(stats.emptyDocCount).toBe(1);
		expect(stats.successCount).toBe(1);
		expect(stats.nullKeptCount).toBe(1);
		expect(stats.total).toBe(3);
	});

	it('全メモにcontentJsonが設定される（Notebook NULL除く）', () => {
		const records: RawRecord[] = [
			{ id: '1', content: '<p>テキスト</p>', type: 'memo' },
			{ id: '2', content: '', type: 'memo' },
			{ id: '3', content: null, type: 'notebook' },
		];

		const { results } = batchConvert(records);

		expect(results[0].contentJson).not.toBeNull();
		expect(results[1].contentJson).not.toBeNull();
		expect(results[2].contentJson).toBeNull();
	});

	it('フォールバックIDをstatsのerrorIdsに正確に記録する', () => {
		const records: RawRecord[] = [
			{ id: 'good1', content: '<p>正常</p>', type: 'memo' },
			{ id: 'bad1', content: '<p>エラー1</p>', type: 'memo' },
			{ id: 'bad2', content: '<p>エラー2</p>', type: 'memo' },
		];

		const stubDoc = {
			type: 'doc' as const,
			content: [{ type: 'paragraph', content: [{ type: 'text', text: '正常' }] }],
		};
		const { stats } = batchConvert(records, (html) => {
			if (html.includes('エラー')) throw new Error('test error');
			return stubDoc;
		});

		expect(stats.errorIds).toHaveLength(2);
		expect(stats.errorIds).toContain('bad1');
		expect(stats.errorIds).toContain('bad2');
		expect(stats.errorIds).not.toContain('good1');
	});
});

// ─── Task 6.2: 移行パイプライン統合シミュレーション ─────────────────────────────

describe('移行パイプライン統合シミュレーション（Task 6.2）', () => {
	const sampleRecords: RawRecord[] = [
		{ id: 'memo-1', content: '<h1>タイトル</h1><p>本文テキスト</p>', type: 'memo' },
		{ id: 'memo-2', content: '<p><strong>太字</strong>と<em>斜体</em></p>', type: 'memo' },
		{ id: 'memo-3', content: '', type: 'memo' },
		{ id: 'nb-1', content: null, type: 'notebook' },
		{ id: 'nb-2', content: '<p>ノートブック本文</p>', type: 'notebook' },
	];

	it('dry-run: 全レコードを変換し、書込ゼロで stats を返す（Req7.5）', () => {
		const { results, stats } = batchConvert(sampleRecords);

		expect(stats.total).toBe(5);
		expect(stats.successCount + stats.emptyDocCount + stats.nullKeptCount).toBe(5);
		expect(stats.fallbackCount).toBe(0);
		// 結果のみ返し、書込は呼び出し元の責任（dry-run は batchConvert 自体が書込を行わない）
		expect(results).toHaveLength(5);
	});

	it('verify: Memo の contentJson は全件非 NULL（SET NOT NULL 前提、Req7.2）', () => {
		const { results } = batchConvert(sampleRecords);

		const memoResults = results.filter((r) => (r as { type?: string }).type === 'memo');
		expect(memoResults.every((r) => r.contentJson !== null)).toBe(true);
	});

	it('verify: Notebook NULL は NULL のまま維持される（Req2.5）', () => {
		const { results } = batchConvert(sampleRecords);

		const notebookNullResult = results.find((r) => r.id === 'nb-1');
		expect(notebookNullResult?.contentJson).toBeNull();
	});

	it('verify: 件数突合 — 変換結果件数は入力件数と一致する（Req7.1）', () => {
		const { results, stats } = batchConvert(sampleRecords);

		expect(results).toHaveLength(sampleRecords.length);
		expect(stats.total).toBe(sampleRecords.length);
	});

	it('verify: サンプル往復忠実度 — contentText に可読テキストが含まれる（Req2.3）', () => {
		const { results } = batchConvert(sampleRecords);

		const memo1 = results.find((r) => r.id === 'memo-1');
		expect(memo1?.contentText).toContain('タイトル');
		expect(memo1?.contentText).toContain('本文テキスト');
		// JSON 構造キー名を含まない（Req6.3）
		expect(memo1?.contentText).not.toContain('"type"');
		expect(memo1?.contentText).not.toContain('paragraph');
	});

	it('冪等再実行: 同一データに対して再実行しても結果が変わらない（Req2.7）', () => {
		const { results: first } = batchConvert(sampleRecords);
		const { results: second } = batchConvert(sampleRecords);

		expect(first).toHaveLength(second.length);
		for (let i = 0; i < first.length; i++) {
			expect(JSON.stringify(first[i]?.contentJson)).toBe(JSON.stringify(second[i]?.contentJson));
			expect(first[i]?.contentText).toBe(second[i]?.contentText);
			expect(first[i]?.fallback).toBe(second[i]?.fallback);
		}
	});

	it('フォールバック閾値超過で cutover を阻止できる（Req7.2）', () => {
		const records: RawRecord[] = [
			{ id: 'bad-1', content: '<p>エラー</p>', type: 'memo' },
			{ id: 'bad-2', content: '<p>エラー</p>', type: 'memo' },
			{ id: 'good-1', content: '<p>正常</p>', type: 'memo' },
		];

		const stubDoc = {
			type: 'doc' as const,
			content: [{ type: 'paragraph', content: [{ type: 'text', text: '正常' }] }],
		};
		const { stats } = batchConvert(records, (html) => {
			if (html.includes('エラー')) throw new Error('conversion failed');
			return stubDoc;
		});

		// フォールバック数が閾値（0）を超えていれば cutover を実行しない判断ができる
		const fallbackThreshold = 0;
		expect(stats.fallbackCount).toBeGreaterThan(fallbackThreshold);
		expect(stats.errorIds).toContain('bad-1');
		expect(stats.errorIds).toContain('bad-2');
	});
});

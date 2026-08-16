import { describe, it, expect } from 'vitest';

/**
 * rich-editor-blocks Task 1.1: TipTap 公式拡張の調達と @tiptap/pm 直接依存化の確認。
 * ここではパッケージが解決できること（調達済み）のみを固定する。
 * 単一情報源（createEditorExtensions.ts）への登録は Task 1.2 以降で行う。
 */
describe('rich-editor-blocks: TipTap 公式拡張の調達（Task 1.1）', () => {
	it('@tiptap/extension-table から TableKit が調達されている', async () => {
		const { TableKit } = await import('@tiptap/extension-table');
		expect(TableKit).toBeDefined();
	});

	it('@tiptap/extension-text-style から TextStyle が調達されている', async () => {
		const { TextStyle } = await import('@tiptap/extension-text-style');
		expect(TextStyle).toBeDefined();
	});

	it('@tiptap/extension-highlight から Highlight が調達されている', async () => {
		const { Highlight } = await import('@tiptap/extension-highlight');
		expect(Highlight).toBeDefined();
	});

	it('@tiptap/extension-details から Details/DetailsSummary/DetailsContent が調達されている', async () => {
		const { Details, DetailsSummary, DetailsContent } = await import('@tiptap/extension-details');
		expect(Details).toBeDefined();
		expect(DetailsSummary).toBeDefined();
		expect(DetailsContent).toBeDefined();
	});

	it('@tiptap/pm が直接依存として解決できる（table/details の ProseMirror 基盤）', async () => {
		const { Plugin } = await import('@tiptap/pm/state');
		expect(Plugin).toBeDefined();
	});
});

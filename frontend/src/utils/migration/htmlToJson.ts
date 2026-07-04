import { generateJSON } from '@tiptap/html';
import type { JSONContent } from '@tiptap/react';
import { createEditorExtensions } from '../../components/editor/createEditorExtensions';
import { extractPlainText, createEmptyDoc, isEmptyDoc } from '../editor/prosemirrorText';

export interface RawRecord {
	id: string;
	content: string | null;
	type: 'memo' | 'notebook';
}

export interface ConversionResult {
	id: string;
	contentJson: JSONContent | null;
	contentText: string;
	fallback: boolean;
	error?: string;
}

export interface ConversionStats {
	total: number;
	successCount: number;
	emptyDocCount: number;
	fallbackCount: number;
	nullKeptCount: number;
	errorIds: string[];
}

export interface BatchConversionResult {
	results: ConversionResult[];
	stats: ConversionStats;
}

export type HtmlConverter = (html: string) => JSONContent;

const extensions = createEditorExtensions({ editable: false });

export const defaultConverter: HtmlConverter = (html: string) =>
	generateJSON(html, extensions) as JSONContent;

export function convertRecord(
	record: RawRecord,
	converter: HtmlConverter = defaultConverter,
): ConversionResult {
	const { id, content, type } = record;

	if (content === null) {
		return { id, contentJson: null, contentText: '', fallback: false };
	}

	if (content.trim() === '') {
		return { id, contentJson: createEmptyDoc(), contentText: '', fallback: false };
	}

	try {
		const json = converter(content);
		const contentText = extractPlainText(json);

		if (isEmptyDoc(json)) {
			return { id, contentJson: createEmptyDoc(), contentText: '', fallback: false };
		}

		return { id, contentJson: json, contentText, fallback: false };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const fallbackJson = type === 'memo' ? createEmptyDoc() : null;
		return { id, contentJson: fallbackJson, contentText: '', fallback: true, error: message };
	}
}

export function batchConvert(
	records: RawRecord[],
	converter: HtmlConverter = defaultConverter,
): BatchConversionResult {
	const results = records.map((r) => convertRecord(r, converter));

	const stats: ConversionStats = {
		total: records.length,
		successCount: 0,
		emptyDocCount: 0,
		fallbackCount: 0,
		nullKeptCount: 0,
		errorIds: [],
	};

	for (const result of results) {
		if (result.contentJson === null) {
			stats.nullKeptCount++;
		} else if (result.fallback) {
			stats.fallbackCount++;
			stats.errorIds.push(result.id);
		} else if (!result.contentText) {
			stats.emptyDocCount++;
		} else {
			stats.successCount++;
		}
	}

	return { results, stats };
}

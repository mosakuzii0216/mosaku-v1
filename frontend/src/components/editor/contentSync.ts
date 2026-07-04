import type { JSONContent } from '@tiptap/react';

/**
 * content 同期の判定結果。
 * - `skip-echo`: 自己エコー（直近 emit した JSON と構造的等価）→ 再適用しない
 * - `skip-equal`: 現在のエディタ内容と等価 → 再適用しない
 * - `apply`: 外部変更（別メモ切替・新規作成・サーバー再取得）→ emitUpdate 抑止で反映
 */
export type ContentSyncDecision = 'skip-echo' | 'skip-equal' | 'apply';

export interface ContentSyncInput {
	/** 親から渡された最新の content（JSONContent） */
	content: JSONContent;
	/** 直近に onUpdate で emit した JSON（自己エコー判定の真実源泉） */
	lastEmitted: JSONContent;
	/** 現在のエディタ内容（editor.getJSON()） */
	currentJson: JSONContent;
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === null || b === null) return a === b;
	if (typeof a !== 'object' || typeof b !== 'object') return a === b;
	if (Array.isArray(a) !== Array.isArray(b)) return false;

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((item, i) => deepEqual(item, (b as unknown[])[i]));
	}

	const aObj = a as Record<string, unknown>;
	const bObj = b as Record<string, unknown>;
	const aKeys = Object.keys(aObj);
	const bKeys = Object.keys(bObj);
	if (aKeys.length !== bKeys.length) return false;
	return aKeys.every(
		(key) => Object.prototype.hasOwnProperty.call(bObj, key) && deepEqual(aObj[key], bObj[key]),
	);
}

/**
 * キー順非依存の構造的等価判定。
 * JSON.stringify を使わず、配列順は保持・オブジェクトはキー集合比較。
 * input rule の巻き戻し（Req3.3）と保存ループ防止（Req8.2）に使用する。
 */
export function isJsonContentEqual(a: JSONContent, b: JSONContent): boolean {
	return deepEqual(a, b);
}

/**
 * タイプ中の自己エコーと真の外部変更を JSON 構造的等価で分離し、
 * input rule の巻き戻し（Req3.3/3.4）と保存ループ（Req8.2）の双方を防ぐ純関数。
 *
 * - 自己エコー判定は「実際に emit した JSONContent」との構造的等価で行う。
 * - 自己エコーを等価判定より優先する（どちらも skip だが意図を明確化するため）。
 * - 外部変更のときのみ `apply` を返し、呼び出し側が emitUpdate:false で反映する（Req3.2）。
 */
export function decideContentSync({
	content,
	lastEmitted,
	currentJson,
}: ContentSyncInput): ContentSyncDecision {
	if (isJsonContentEqual(content, lastEmitted)) {
		return 'skip-echo';
	}
	if (isJsonContentEqual(content, currentJson)) {
		return 'skip-equal';
	}
	return 'apply';
}

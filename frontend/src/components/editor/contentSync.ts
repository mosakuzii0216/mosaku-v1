/**
 * content 同期の判定結果。
 * - `skip-echo`: 自己エコー（直近 emit した HTML と一致）→ 再適用しない
 * - `skip-equal`: 現在のエディタ内容と等価 → 再適用しない
 * - `apply`: 外部変更（別メモ切替・新規作成・サーバー再取得）→ emitUpdate 抑止で反映
 */
export type ContentSyncDecision = 'skip-echo' | 'skip-equal' | 'apply';

export interface ContentSyncInput {
	/** 親から渡された最新の content（HTML 文字列） */
	content: string;
	/** 直近に onUpdate で emit した HTML（自己エコー判定の真実源泉） */
	lastEmitted: string;
	/** 現在のエディタ内容（editor.getHTML()） */
	currentHtml: string;
}

/**
 * タイプ中の自己エコーと真の外部変更を文字列一致で分離し、
 * input rule の巻き戻し（Req1.2/1.3）と保存ループ（Req1.5/8.4）の双方を防ぐ純関数。
 *
 * - 自己エコー判定は「実際に emit した HTML 文字列」と完全一致で行うため、
 *   HTML 再直列化の揺れや input-rule 中間状態に影響されない（Req1.6）。
 * - 自己エコーを等価判定より優先する（どちらも skip だが意図を明確化するため）。
 * - 外部変更のときのみ `apply` を返し、呼び出し側が emitUpdate:false で反映する（Req1.4）。
 */
export function decideContentSync({
	content,
	lastEmitted,
	currentHtml,
}: ContentSyncInput): ContentSyncDecision {
	if (content === lastEmitted) {
		return 'skip-echo';
	}
	if (content === currentHtml) {
		return 'skip-equal';
	}
	return 'apply';
}

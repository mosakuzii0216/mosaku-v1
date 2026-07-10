/**
 * コールアウトの種別レジストリ（Task 4.1）。
 *
 * `label`/`icon` は NodeView の種別切り替え UI と CSS が参照する表示用の値であり、
 * doc の attrs には保存しない（`variant` 識別子のみが永続化対象＝Req7.6 の抽出整合）。
 */
export interface CalloutVariantDef {
	/** doc attrs へ永続化される識別子 */
	name: string;
	/** NodeView の種別切り替え UI に表示するラベル */
	label: string;
	/** NodeView の種別切り替え UI に表示するアイコン（本文描画のアイコンは CSS ::before が担う） */
	icon: string;
}

export const DEFAULT_CALLOUT_VARIANT = 'point';

export const CALLOUT_VARIANTS: readonly CalloutVariantDef[] = [
	{ name: 'point', label: 'ポイント', icon: '💡' },
	{ name: 'warning', label: '注意', icon: '⚠️' },
];

/**
 * variant 識別子から表示定義を解決する。未知 variant は既定（先頭 = point）へ
 * フォールバックする（前方互換・Req1.2）。doc 側の attrs 値そのものは書き換えない。
 */
export function resolveCalloutVariant(variant: string | null | undefined): CalloutVariantDef {
	return CALLOUT_VARIANTS.find((v) => v.name === variant) ?? CALLOUT_VARIANTS[0];
}

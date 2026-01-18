/**
 * アプリケーション内で使用される列挙型定義
 */

/**
 * オブジェクトタイプ
 * - MEMO: メモ
 * - NOTEBOOK: ノートブック
 * - TAG: タグ
 */
export const ObjectType = {
	MEMO: 'memo',
	NOTEBOOK: 'notebook',
	TAG: 'tag',
} as const;

export type ObjectType = (typeof ObjectType)[keyof typeof ObjectType];

/**
 * ビュータイプ
 * - LIST: 一覧表示
 * - EDIT: 編集表示
 * - CREATE: 作成表示
 */
export const ViewType = {
	LIST: 'list',
	EDIT: 'edit',
	CREATE: 'create',
} as const;

export type ViewType = (typeof ViewType)[keyof typeof ViewType];

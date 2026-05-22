import { ERROR_CODES } from './error-codes';
import type { ErrorCode } from './error-codes';

/**
 * エラーコードに対応する日本語メッセージ
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
	// 認証エラー
	[ERROR_CODES.AUTH.INVALID_CREDENTIALS]: '認証情報が正しくありません',
	[ERROR_CODES.AUTH.AUTHENTICATION_REQUIRED]: '認証が必要です',
	[ERROR_CODES.AUTH.INVALID_TOKEN]: 'トークンが無効です',
	[ERROR_CODES.AUTH.USER_NOT_FOUND]: 'ユーザーが見つかりません',
	[ERROR_CODES.AUTH.INVITATION_REQUIRED]: '招待コードが必要です',
	[ERROR_CODES.AUTH.EMAIL_ALREADY_EXISTS]: 'このメールアドレスは既に登録されています',
	[ERROR_CODES.AUTH.USER_ALREADY_EXISTS]: 'このユーザーは既に存在します',
	[ERROR_CODES.AUTH.PASSWORD_NOT_SET]: 'パスワードが設定されていません',
	[ERROR_CODES.AUTH.INVALID_PASSWORD]: '現在のパスワードが正しくありません',
	[ERROR_CODES.AUTH.REFRESH_TOKEN_INVALID]:
		'セッションを継続できませんでした。再度ログインしてください',
	[ERROR_CODES.AUTH.REFRESH_TOKEN_REVOKED]: 'セッションが終了しています。再度ログインしてください',
	[ERROR_CODES.AUTH.REFRESH_TOKEN_REUSED]:
		'セキュリティ上の理由でセッションを終了しました。再度ログインしてください',
	[ERROR_CODES.AUTH.REFRESH_TOKEN_EXPIRED]:
		'セッションの有効期限が切れました。再度ログインしてください',

	// 認可エラー
	[ERROR_CODES.AUTHZ.FORBIDDEN]: 'アクセスが拒否されました',
	[ERROR_CODES.AUTHZ.NOT_OWNER]: '自分が作成したリソースのみアクセスできます',
	[ERROR_CODES.AUTHZ.ADMIN_ONLY]: '管理者のみが実行できます',
	[ERROR_CODES.AUTHZ.NO_PERMISSION]: 'この操作を実行する権限がありません',
	[ERROR_CODES.AUTHZ.ADMIN_EMAIL_REQUIRED]: 'このメールアドレスは管理者として認証されていません',

	// リソースエラー
	[ERROR_CODES.RESOURCE.NOT_FOUND]: 'リソースが見つかりません',
	[ERROR_CODES.RESOURCE.ALREADY_EXISTS]: 'リソースは既に存在します',
	[ERROR_CODES.RESOURCE.IN_USE]: '使用中のリソースは削除できません',
	[ERROR_CODES.RESOURCE.ALREADY_FAVORITED]: '既にお気に入りに追加されています',
	[ERROR_CODES.RESOURCE.NOT_FAVORITED]: 'お気に入りに登録されていません',
	[ERROR_CODES.RESOURCE.CONFLICT]: 'リソースは他のクライアントによって更新されています',

	// バリデーションエラー
	[ERROR_CODES.VALIDATION.INVALID_INPUT]: '入力値が不正です',
	[ERROR_CODES.VALIDATION.REQUIRED_FIELD]: '必須項目が入力されていません',
	[ERROR_CODES.VALIDATION.INVALID_FORMAT]: '入力形式が正しくありません',
	[ERROR_CODES.VALIDATION.MISSING_CSS_OR_STYLES]:
		'CSSファイルパスまたは有効なスタイルデータが必要です',
	[ERROR_CODES.VALIDATION.MISSING_REQUIRED_STYLE_FIELD]:
		'スタイル設定に必須フィールドが含まれていません',
	[ERROR_CODES.VALIDATION.INVALID_PAYLOAD]: 'ペイロードが無効です',

	// 招待コードエラー
	[ERROR_CODES.INVITATION.INVALID_CODE]: '招待コードが無効です',
	[ERROR_CODES.INVITATION.EXPIRED]: '招待コードの有効期限が切れています',
	[ERROR_CODES.INVITATION.MAX_USES_REACHED]: '招待コードの使用回数が上限に達しています',
	[ERROR_CODES.INVITATION.NOT_FOUND]: '招待コードが見つかりません',
};

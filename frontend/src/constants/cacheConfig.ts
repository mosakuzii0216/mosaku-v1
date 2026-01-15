/**
 * React Query キャッシング戦略設定
 *
 * キャッシュ設定の指針:
 * - staleTime: データが「古い」と見なされるまでの時間。この間は再フェッチしない
 * - gcTime (旧cacheTime): キャッシュがガベージコレクションされるまでの時間
 *
 * データ更新頻度に基づいて3つのカテゴリに分類:
 * 1. FREQUENT: 頻繁に変更されるデータ（メモ、お気に入り）
 * 2. MODERATE: 時々変更されるデータ（ノートブック、タグ、テーマ一覧）
 * 3. RARE: ほとんど変更されないデータ（システムテーマ）
 */

const MINUTE = 60 * 1000;

/**
 * キャッシュ設定タイプ
 */
interface CacheConfig {
	staleTime: number;
	gcTime: number;
}

/**
 * データカテゴリ別キャッシュ設定
 */
export const CACHE_CONFIG = {
	/**
	 * 頻繁に変更されるデータ
	 * - メモ: ユーザーが頻繁に作成・編集
	 * - お気に入り: ユーザーが頻繁に追加・削除
	 */
	FREQUENT: {
		staleTime: 1 * MINUTE, // 1分
		gcTime: 5 * MINUTE, // 5分
	} as CacheConfig,

	/**
	 * 時々変更されるデータ
	 * - ノートブック: 構造変更は稀だが、テーマ変更などはある
	 * - タグ: 新規追加はあるが頻繁ではない
	 * - テーマ一覧: 管理者による変更のみ
	 */
	MODERATE: {
		staleTime: 5 * MINUTE, // 5分
		gcTime: 15 * MINUTE, // 15分
	} as CacheConfig,

	/**
	 * ほとんど変更されないデータ
	 * - システムテーマ: デプロイ時のみ変更
	 * - 公開テーマ: 管理者による変更のみ
	 */
	RARE: {
		staleTime: 10 * MINUTE, // 10分
		gcTime: 30 * MINUTE, // 30分
	} as CacheConfig,
} as const;

/**
 * エンティティ別キャッシュ設定
 *
 * 各エンティティに適切なキャッシュカテゴリを割り当て
 */
export const ENTITY_CACHE_CONFIG = {
	// メモ関連
	memos: {
		list: CACHE_CONFIG.FREQUENT,
		detail: CACHE_CONFIG.FREQUENT,
		search: CACHE_CONFIG.FREQUENT,
	},

	// ノートブック関連
	notebooks: {
		list: CACHE_CONFIG.MODERATE,
		detail: CACHE_CONFIG.MODERATE,
	},

	// タグ関連
	tags: {
		list: CACHE_CONFIG.MODERATE,
		search: CACHE_CONFIG.MODERATE,
	},

	// テーマ関連
	themes: {
		list: CACHE_CONFIG.MODERATE,
		detail: CACHE_CONFIG.MODERATE,
		system: CACHE_CONFIG.RARE,
		public: CACHE_CONFIG.MODERATE,
		favorites: CACHE_CONFIG.FREQUENT,
	},
} as const;

/**
 * React Query のデフォルトオプションを取得
 */
export const getDefaultQueryOptions = () => ({
	staleTime: CACHE_CONFIG.MODERATE.staleTime,
	gcTime: CACHE_CONFIG.MODERATE.gcTime,
	retry: (failureCount: number, error: Error) => {
		// 認証エラーはリトライしない
		if (error.message?.includes('認証') || error.message?.includes('401')) {
			return false;
		}
		return failureCount < 2;
	},
});

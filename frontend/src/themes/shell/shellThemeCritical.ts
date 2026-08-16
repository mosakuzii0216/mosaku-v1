import type { ThemeEffectKey } from '../../types/theme';

/*
 * shellThemeCritical — Critical Vars マップ＋即時適用ユーティリティ（Layer②）
 * ============================================================================
 * 役割（FOUC ゼロ / 2.3 の belt-and-suspenders）:
 *   first paint 前に <html> の data-theme と地色を確定するための「極小マップ＋同期適用」。
 *   index.html のインラインブート（3.3）と runtime 切替（useShellThemeStore / 3.2）の双方が
 *   本ユーティリティ（と同等ロジック）を使い、白フラッシュを構造的に消す。
 *
 * 層の境界（設計「層所有」表）:
 *   - 本マップは surface / on-surface / --shell-base-bg のみを持つ。accent/outline/elevation 等は
 *     Layer①（tokens.css の [data-theme="<slug>"]）が render-blocking で first paint に供給するため、
 *     ここには含めない＝「半テーマ窓（accent だけ初期値）」を作らない。
 *   - mori の値は tokens.css [data-theme="mori"]（色トークンの単一の源泉）と一致させる。
 *     drift は shellThemeCritical.test.ts が tokens.css をパースして機械検出する。
 *
 * 例外安全:
 *   localStorage 利用不可（プライベートモード等）・破損値では throw せず、中立既定
 *   （data-theme 無し＝現状の白シェル）へフォールバックする（7.1, 7.3）。
 */

/** localStorage 永続キー。値は JSON { id, slug }。 */
export const SHELL_THEME_STORAGE_KEY = 'mosaku.shell-theme';

/** アプリ単位で選択されたシェルテーマ（UI 選択のみ。サーバー状態は React Query が真実の源泉）。 */
export interface ShellThemeSelection {
	/** DB theme id（Theme 本体・Layer③ リッチパックの解決に使用） */
	id: string;
	/** 安定スラッグ（バンドルトークン解決キー＝Layer①/②の data-theme 値） */
	slug: ThemeEffectKey;
}

const VALID_SLUGS: ReadonlySet<string> = new Set<ThemeEffectKey>(['mori', 'umi', 'yoru', 'asa']);

/** critical で扱うコア変数キーの正準集合（テーマ切替時のクリア対象＝前テーマの値を残さない）。 */
const CRITICAL_VAR_KEYS = ['--surface', '--on-surface', '--shell-base-bg'] as const;

/**
 * slug → コア変数（surface / on-surface / 地色）の極小マップ。
 * 森のみ実値（tokens.css と一致）。海・夜・朝は placeholder（6.4）。
 */
export const CRITICAL_THEME_VARS: Record<ThemeEffectKey, Record<`--${string}`, string>> = {
	mori: {
		'--surface': 'rgba(6, 38, 22, 0.74)',
		'--on-surface': '#e8f6ee',
		'--shell-base-bg': '#062616',
	},
	umi: {},
	yoru: {},
	asa: {},
};

function isValidSlug(value: unknown): value is ThemeEffectKey {
	return typeof value === 'string' && VALID_SLUGS.has(value);
}

/**
 * 永続テーマを localStorage から同期読み出しする（first render／first paint で確定）。
 * 破損・値域外・アクセス不可では例外を投げず null（中立既定）を返す。
 */
export function readPersistedShellTheme(): ShellThemeSelection | null {
	try {
		const raw = globalThis.localStorage?.getItem(SHELL_THEME_STORAGE_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			'id' in parsed &&
			'slug' in parsed &&
			typeof (parsed as { id: unknown }).id === 'string' &&
			isValidSlug((parsed as { slug: unknown }).slug)
		) {
			return {
				id: (parsed as { id: string }).id,
				slug: (parsed as { slug: ThemeEffectKey }).slug,
			};
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * 永続テーマを localStorage へ書き込む（null でキー削除）。
 * アクセス不可（プライベートモード等）では握りつぶす（in-memory フォールバックは store 側が担保）。
 */
export function writePersistedShellTheme(selection: ShellThemeSelection | null): void {
	try {
		if (selection === null) {
			globalThis.localStorage?.removeItem(SHELL_THEME_STORAGE_KEY);
			return;
		}
		globalThis.localStorage?.setItem(SHELL_THEME_STORAGE_KEY, JSON.stringify(selection));
	} catch {
		// localStorage 利用不可 → 永続を諦める（描画は in-memory state で継続）
	}
}

/**
 * <html> に data-theme（slug）と critical コア変数を即時適用する。
 * - null: data-theme と critical 値を除去（中立既定へ戻す）。
 * - slug: data-theme を設定し CRITICAL_THEME_VARS[slug] を適用。さらに belt-and-suspenders として
 *   <html> 背景を地色で実際に塗る（var を消費する CSS が無くても first paint で白を出さない）。
 * テーマ切替時に前テーマの値が残らないよう、適用前に critical 変数を必ずクリアする。
 */
export function applyCriticalTheme(slug: ThemeEffectKey | null): void {
	const el = globalThis.document?.documentElement;
	if (!el) return;

	// 前回適用した critical 値を必ずクリア（mori→null／mori→umi で残留させない）
	for (const key of CRITICAL_VAR_KEYS) {
		el.style.removeProperty(key);
	}
	el.style.removeProperty('background-color');

	if (slug === null) {
		el.removeAttribute('data-theme');
		return;
	}

	el.setAttribute('data-theme', slug);

	const vars = CRITICAL_THEME_VARS[slug] ?? {};
	for (const [key, value] of Object.entries(vars)) {
		el.style.setProperty(key, value);
	}

	// belt-and-suspenders: <html> 地色を最初のフレームで実際に塗る（pre-mount/reduced-motion フォールバック）
	const baseBg = vars['--shell-base-bg'];
	if (baseBg) {
		el.style.backgroundColor = baseBg;
	}
}

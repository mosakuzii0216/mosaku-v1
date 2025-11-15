/**
 * テーマCSSの動的読み込みユーティリティ
 */

/**
 * 読み込み済みテーマを管理
 * Key: themeId, Value: HTMLStyleElement
 */
const loadedThemes = new Map<string, HTMLStyleElement>();

/**
 * 読み込み中のテーマを管理（重複読み込み防止）
 * Key: themeId, Value: Promise
 */
const loadingThemes = new Map<string, Promise<void>>();

/**
 * テーマCSSを読み込んで<head>に注入
 *
 * @param themeId - テーマのID（例: "clxxx123"）
 * @param cssPath - CSSファイルのパス（例: "ao/ao.css"）
 */
export async function loadThemeCSS(themeId: string, cssPath: string): Promise<void> {
	// 既に読み込み済み
	if (loadedThemes.has(themeId)) {
		console.log(`[themeLoader] Theme ${themeId} already loaded`);
		return;
	}

	// 読み込み中
	if (loadingThemes.has(themeId)) {
		console.log(`[themeLoader] Theme ${themeId} is loading, waiting...`);
		return loadingThemes.get(themeId)!;
	}

	// 読み込み開始
	console.log(`[themeLoader] Loading theme ${themeId} from ${cssPath}`);

	const loadPromise = (async () => {
		try {
			// CSSファイルをfetch
			const response = await fetch(`/themes/${cssPath}`);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const cssText = await response.text();

			// CSS変換: .theme-root を .theme-root[data-theme-id="xxx"] に置換（衝突防止）
			const scopedCSS = cssText.replace(/\.theme-root\b/g, `.theme-root[data-theme-id="${themeId}"]`);

			// <style>タグを作成
			const styleElement = document.createElement('style');
			styleElement.id = `theme-${themeId}`;
			styleElement.setAttribute('data-theme-name', cssPath);
			styleElement.textContent = scopedCSS;

			// <head>に追加
			document.head.appendChild(styleElement);

			// 管理用Mapに保存
			loadedThemes.set(themeId, styleElement);

			console.log(`[themeLoader] Theme ${themeId} loaded and scoped successfully`);
		} catch (error) {
			console.error(`[themeLoader] Failed to load theme ${themeId}:`, error);
			throw error;
		} finally {
			// 読み込み完了後、読み込み中リストから削除
			loadingThemes.delete(themeId);
		}
	})();

	loadingThemes.set(themeId, loadPromise);
	return loadPromise;
}

/**
 * テーマCSSをアンロード（メモリ節約・デバッグ用）
 */
export function unloadThemeCSS(themeId: string): void {
	const styleElement = loadedThemes.get(themeId);

	if (styleElement && styleElement.parentNode) {
		styleElement.parentNode.removeChild(styleElement);
		loadedThemes.delete(themeId);
		console.log(`[themeLoader] Theme ${themeId} unloaded`);
	}
}

/**
 * テーマが読み込まれているかチェック
 */
export function isThemeLoaded(themeId: string): boolean {
	return loadedThemes.has(themeId);
}

/**
 * すべての読み込み済みテーマをアンロード
 */
export function unloadAllThemes(): void {
	loadedThemes.forEach((styleElement, themeId) => {
		if (styleElement.parentNode) {
			styleElement.parentNode.removeChild(styleElement);
		}
	});
	loadedThemes.clear();
	console.log('[themeLoader] All themes unloaded');
}

/**
 * デバッグ用: 読み込み済みテーマのリスト
 */
export function getLoadedThemes(): string[] {
	return Array.from(loadedThemes.keys());
}

import { useEffect } from 'react';
import { logger } from '../utils/logger';

interface ThemeForCSS {
	id: string;
	cssFilePath?: string | null;
}

type ThemeInput = ThemeForCSS | ThemeForCSS[] | null | undefined;

/**
 * テーマのCSSファイルを動的に読み込み、スコープ化して適用するフック
 * @param themes - 単一テーマまたはテーマの配列
 */
export function useThemeCSS(themes: ThemeInput): void {
	useEffect(() => {
		// 単一テーマを配列に正規化
		const themeArray = normalizeToArray(themes);
		if (themeArray.length === 0) return;

		const loadedStyleElements: HTMLStyleElement[] = [];

		const loadAllThemeCSS = async () => {
			for (const theme of themeArray) {
				if (!theme.cssFilePath) continue;

				try {
					// CSSファイルを読み込む
					const response = await fetch(`/themes/${theme.cssFilePath}`);
					const cssText = await response.text();

					// .theme-root を [data-theme-id="themeid"] に置き換えてスコープ化
					const scopedCSS = cssText.replace(/\.theme-root\b/g, `[data-theme-id="${theme.id}"]`);

					// <style>タグを作成して挿入
					const styleElement = document.createElement('style');
					styleElement.setAttribute('data-theme-loader', theme.id);
					styleElement.textContent = scopedCSS;
					document.head.appendChild(styleElement);

					loadedStyleElements.push(styleElement);
				} catch (error) {
					logger.error(`Failed to load theme CSS: ${theme.cssFilePath}`, error);
				}
			}
		};

		loadAllThemeCSS();

		// クリーンアップ: コンポーネントがアンマウントされたらスタイルを削除
		return () => {
			loadedStyleElements.forEach((element) => {
				if (element.parentNode) {
					document.head.removeChild(element);
				}
			});
		};
	}, [themes]);
}

function normalizeToArray(input: ThemeInput): ThemeForCSS[] {
	if (!input) return [];
	if (Array.isArray(input)) return input;
	return [input];
}

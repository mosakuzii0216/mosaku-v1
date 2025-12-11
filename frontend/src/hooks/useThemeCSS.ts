import { useEffect } from 'react';

/**
 * テーマのCSSファイルを動的に読み込み、スコープ化して適用するフック
 * @param themes - 読み込むテーマの配列 [{ id: 'aka', cssFilePath: 'aka/aka.css' }, ...]
 */
export const useThemeCSS = (
	themes: Array<{ id: string; cssFilePath: string | null }>,
) => {
	useEffect(() => {
		const loadedStyleElements: HTMLStyleElement[] = [];

		const loadThemeCSS = async () => {
			for (const theme of themes) {
				if (!theme.cssFilePath) continue;

				try {
					// CSSファイルを読み込む
					const response = await fetch(`/themes/${theme.cssFilePath}`);
					const cssText = await response.text();

					// .theme-root を [data-theme-id="themeid"] に置き換えてスコープ化
					const scopedCSS = cssText.replace(
						/\.theme-root\b/g,
						`[data-theme-id="${theme.id}"]`,
					);

					// <style>タグを作成して挿入
					const styleElement = document.createElement('style');
					styleElement.setAttribute('data-theme-loader', theme.id);
					styleElement.textContent = scopedCSS;
					document.head.appendChild(styleElement);

					loadedStyleElements.push(styleElement);
				} catch (error) {
					console.error(`Failed to load theme CSS: ${theme.cssFilePath}`, error);
				}
			}
		};

		loadThemeCSS();

		// クリーンアップ: コンポーネントがアンマウントされたらスタイルを削除
		return () => {
			loadedStyleElements.forEach((element) => {
				document.head.removeChild(element);
			});
		};
	}, [themes]);
};

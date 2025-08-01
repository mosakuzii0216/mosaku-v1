/**
 * CSSファイル動的読み込みユーティリティ
 */

interface LoadedCSS {
  path: string;
  content: string;
  styleElement: HTMLStyleElement;
}

class CSSFileLoader {
  private loadedCSS = new Map<string, LoadedCSS>();
  private readonly baseThemePath = '/themes/';

  /**
   * CSSファイルを動的に読み込み・適用
   */
  async loadAndApplyCSS(cssFilePath: string, themeId: string): Promise<void> {
    try {
      // 既存のテーマCSSを削除
      this.removeAllThemeCSS();

      // CSSファイルを読み込み
      const fullPath = `${this.baseThemePath}${cssFilePath}`;
      const cssContent = await this.fetchCSSContent(fullPath);

      // スタイル要素を作成・適用
      const styleElement = this.createStyleElement(themeId, cssContent);
      document.head.appendChild(styleElement);

      // 読み込み履歴に保存
      this.loadedCSS.set(themeId, {
        path: cssFilePath,
        content: cssContent,
        styleElement,
      });

      console.log(`✅ テーマCSS読み込み完了: ${themeId} (${cssFilePath})`);
    } catch (error) {
      console.error(`❌ テーマCSS読み込み失敗: ${themeId} (${cssFilePath})`, error);
      throw error;
    }
  }

  /**
   * 指定したテーマのCSSを削除
   */
  removeThemeCSS(themeId: string): void {
    const loaded = this.loadedCSS.get(themeId);
    if (loaded) {
      loaded.styleElement.remove();
      this.loadedCSS.delete(themeId);
      console.log(`🗑️ テーマCSS削除: ${themeId}`);
    }
  }

  /**
   * 全てのテーマCSSを削除
   */
  removeAllThemeCSS(): void {
    for (const [themeId] of this.loadedCSS) {
      this.removeThemeCSS(themeId);
    }

    // 念のため、テーマ関連のスタイル要素をすべて削除
    const themeStyles = document.querySelectorAll('style[data-theme]');
    themeStyles.forEach(style => style.remove());
  }

  /**
   * 現在適用されているテーマを取得
   */
  getCurrentTheme(): string | null {
    const themes = Array.from(this.loadedCSS.keys());
    return themes.length > 0 ? themes[0] : null;
  }

  /**
   * テーマが読み込み済みかチェック
   */
  isThemeLoaded(themeId: string): boolean {
    return this.loadedCSS.has(themeId);
  }

  /**
   * 読み込み済みテーマの一覧
   */
  getLoadedThemes(): string[] {
    return Array.from(this.loadedCSS.keys());
  }

  /**
   * CSSファイルの内容を取得
   */
  private async fetchCSSContent(fullPath: string): Promise<string> {
    const response = await fetch(fullPath);
    
    if (!response.ok) {
      throw new Error(`CSSファイルの取得に失敗: ${response.status} ${response.statusText}`);
    }

    const cssContent = await response.text();
    
    if (!cssContent || cssContent.trim().length === 0) {
      throw new Error('CSSファイルの内容が空です');
    }

    return cssContent;
  }

  /**
   * スタイル要素を作成
   */
  private createStyleElement(themeId: string, cssContent: string): HTMLStyleElement {
    const styleElement = document.createElement('style');
    styleElement.setAttribute('data-theme', themeId);
    styleElement.setAttribute('data-theme-type', 'css-file');
    styleElement.textContent = cssContent;
    
    return styleElement;
  }

  /**
   * テーマCSSのプリロード
   */
  async preloadThemeCSS(cssFilePath: string): Promise<string> {
    const fullPath = `${this.baseThemePath}${cssFilePath}`;
    return await this.fetchCSSContent(fullPath);
  }
}

// シングルトンインスタンス
export const cssFileLoader = new CSSFileLoader();

/**
 * テーマオブジェクトからCSSファイルを読み込み・適用
 */
export async function applyThemeFromFile(theme: any): Promise<void> {
  if (!theme) {
    console.warn('⚠️ テーマが指定されていません');
    return;
  }

  // CSSファイルパス参照型の場合
  if (theme.cssFilePath) {
    await cssFileLoader.loadAndApplyCSS(theme.cssFilePath, theme.id);
    return;
  }

  // 既存形式の場合（後方互換性）
  if (theme.styles?.cssContent) {
    // インラインCSS適用（cssThemeUtils.tsの機能を使用）
    console.log('📄 インラインCSS形式のテーマを検出、旧形式での適用');
    return;
  }

  console.warn('⚠️ 対応していないテーマ形式です:', theme);
}

/**
 * CSSファイルの存在確認
 */
export async function checkThemeCSSExists(cssFilePath: string): Promise<boolean> {
  try {
    const fullPath = `/themes/${cssFilePath}`;
    const response = await fetch(fullPath, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 利用可能なテーマCSSファイル一覧を取得
 */
export async function getAvailableThemeFiles(): Promise<string[]> {
  // 実際の実装では、サーバーAPIから取得するか、
  // 静的リストを管理する
  const knownThemes = [
    'clean-white.css',
    'soft-gray.css', 
    'dark-mode.css',
    'professional.css',
    'executive.css',
    'study-blue.css',
    'academic.css',
    'artist.css',
    'vintage.css',
    'natural-green.css',
    'warm-beige.css',
    'sakura-pink.css',
    'ocean-blue.css',
    'high-contrast.css',
    'sepia-eye-care.css',
  ];

  // 存在確認をして有効なファイルのみ返す
  const availableThemes: string[] = [];
  for (const theme of knownThemes) {
    if (await checkThemeCSSExists(theme)) {
      availableThemes.push(theme);
    }
  }

  return availableThemes;
}
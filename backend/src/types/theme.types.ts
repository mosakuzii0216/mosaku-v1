/**
 * テーマスタイル設定の型定義
 * Prisma Theme.styles フィールド用のスキーマ
 */

export interface ThemeColors {
  // 基本色
  backgroundColor: string;        // メモ背景色
  textColor: string;             // メインテキスト色
  
  // UI要素色
  borderColor: string;           // ボーダー色
  hoverBackgroundColor: string;  // ホバー時背景色
  accentColor: string;          // アクセント色（ボタン、リンクなど）
  
  // テキスト階層色
  headingColor: string;         // 見出し色
  subtextColor: string;         // サブテキスト色（日付、メタ情報）
  mutedTextColor: string;       // 薄いテキスト色
  
  // 状態色
  successColor?: string;        // 成功色
  warningColor?: string;        // 警告色
  errorColor?: string;          // エラー色
  
  // 追加UI色
  cardShadowColor?: string;     // カード影色
  dividerColor?: string;        // 区切り線色
}

export interface ThemeTypography {
  // フォントファミリー
  fontFamily: string;           // メインフォント
  headingFontFamily?: string;   // 見出し用フォント
  
  // フォントサイズ（rem単位）
  fontSize: string;             // ベースフォントサイズ
  headingFontSize?: string;     // 見出しフォントサイズ
  smallFontSize?: string;       // 小テキストフォントサイズ
  
  // フォントウェイト
  fontWeight: string;           // 通常テキスト
  headingFontWeight?: string;   // 見出し
  boldFontWeight?: string;      // 太字
  
  // 行間・文字間隔
  lineHeight: string;           // 行の高さ
  letterSpacing?: string;       // 文字間隔
  
  // テキストの配置・装飾
  textAlign?: 'left' | 'center' | 'right' | 'justify';
}

export interface ThemeLayout {
  // 余白・間隔
  padding: string;              // 基本余白
  margin: string;               // 基本マージン
  
  // ボーダー・角丸
  borderRadius: string;         // 角丸サイズ
  borderWidth?: string;         // ボーダー幅
  
  // 影・エフェクト
  boxShadow?: string;          // ボックス影
  
  // レスポンシブ設定
  maxWidth?: string;           // 最大幅
  minHeight?: string;          // 最小高
}

export interface ThemeAccessibility {
  // アクセシビリティ設定
  highContrast?: boolean;       // ハイコントラストモード
  reducedMotion?: boolean;      // アニメーション削減
  fontSize?: 'small' | 'medium' | 'large' | 'xlarge'; // フォントサイズ設定
}

export interface ThemeAnimations {
  // アニメーション設定
  transitionDuration?: string;  // トランジション時間
  hoverTransition?: string;     // ホバーアニメーション
  fadeInDuration?: string;      // フェードイン時間
}

/**
 * メインのテーマスタイル設定
 * Prisma Theme.styles に格納される JSON の型
 */
export interface ThemeStyles {
  // 必須設定
  colors: ThemeColors;
  typography: ThemeTypography;
  layout: ThemeLayout;
  
  // オプション設定
  accessibility?: ThemeAccessibility;
  animations?: ThemeAnimations;
  
  // カスタムCSS変数（高度なカスタマイズ用）
  customProperties?: Record<string, string>;
  
  // テーマバージョン（将来の互換性のため）
  version: string;
}

/**
 * テーマプリセット用の基本設定
 */
export interface ThemePreset {
  name: string;
  description: string;
  category: 'basic' | 'business' | 'creative' | 'study' | 'seasonal' | 'accessibility';
  styles: ThemeStyles;
  isSystem: boolean;
  isPublic: boolean;
}

/**
 * CSS-in-JS または CSS Variables 生成用のヘルパー型
 */
export interface ThemeCSSVariables {
  '--theme-bg-color': string;
  '--theme-text-color': string;
  '--theme-border-color': string;
  '--theme-accent-color': string;
  '--theme-font-family': string;
  '--theme-font-size': string;
  '--theme-line-height': string;
  '--theme-border-radius': string;
  '--theme-padding': string;
  '--theme-margin': string;
  [key: string]: string;
}
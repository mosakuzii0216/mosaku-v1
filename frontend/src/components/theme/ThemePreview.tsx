import React from 'react';
import type { Theme } from '../../types/theme';
import { getThemeVariables } from '../../utils/cssThemeUtils';

interface ThemePreviewProps {
  theme: Theme;
  isSelected?: boolean;
  onClick?: () => void;
  showFavoriteButton?: boolean;
  onFavoriteToggle?: (themeId: string, isFavorited: boolean) => void;
  className?: string;
}

export const ThemePreview: React.FC<ThemePreviewProps> = ({
  theme,
  isSelected = false,
  onClick,
  showFavoriteButton = false,
  onFavoriteToggle,
  className = '',
}) => {
  // CSS参照型と既存形式の両方に対応
  let themeVars;
  try {
    themeVars = getThemeVariables(theme);
  } catch (error) {
    console.error('テーマ変数の解析エラー:', theme.id, error);
    // フォールバック値を設定
    themeVars = {
      backgroundColor: '#FFFFFF',
      textColor: '#1F2937',
      accentColor: '#3B82F6',
      borderColor: '#E5E7EB',
      headingColor: '#111827',
      subtextColor: '#6B7280',
      fontFamily: '"Inter", system-ui, sans-serif',
      fontSize: '1rem',
      borderRadius: '0.5rem',
      padding: '1rem',
    };
  }

  // CSS変数を動的に生成
  const cssVariables = {
    '--preview-bg': themeVars.backgroundColor || '#FFFFFF',
    '--preview-text': themeVars.textColor || '#1F2937',
    '--preview-accent': themeVars.accentColor || '#3B82F6',
    '--preview-border': themeVars.borderColor || '#E5E7EB',
    '--preview-heading': themeVars.headingColor || '#111827',
    '--preview-subtext': themeVars.subtextColor || '#6B7280',
    '--preview-font-family': themeVars.fontFamily || '"Inter", system-ui, sans-serif',
    '--preview-font-size': themeVars.fontSize || '1rem',
    '--preview-border-radius': themeVars.borderRadius || '0.5rem',
    '--preview-padding': themeVars.padding || '1rem',
  } as React.CSSProperties;

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onFavoriteToggle) {
      onFavoriteToggle(theme.id, !theme.isFavorited);
    }
  };

  return (
    <div
      className={`relative group cursor-pointer transition-all duration-200 ${
        isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
      } ${className}`}
      onClick={onClick}
      style={cssVariables}
    >
      {/* テーマプレビューカード */}
      <div
        className="border-2 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
        style={{
          backgroundColor: 'var(--preview-bg)',
          borderColor: 'var(--preview-border)',
          borderRadius: 'var(--preview-border-radius)',
          fontFamily: 'var(--preview-font-family)',
        }}
      >
        {/* ヘッダー部分 */}
        <div
          className="p-3 border-b"
          style={{
            borderBottomColor: 'var(--preview-border)',
            padding: 'calc(var(--preview-padding) * 0.75)',
          }}
        >
          <h3
            className="font-semibold text-sm truncate"
            style={{
              color: 'var(--preview-heading)',
              fontSize: 'calc(var(--preview-font-size) * 0.9)',
            }}
          >
            {theme.name}
          </h3>
          {theme.description && (
            <p
              className="text-xs mt-1 truncate"
              style={{
                color: 'var(--preview-subtext)',
                fontSize: 'calc(var(--preview-font-size) * 0.75)',
              }}
            >
              {theme.description}
            </p>
          )}
        </div>

        {/* コンテンツ部分（メモのプレビュー風） */}
        <div
          className="p-3"
          style={{
            padding: 'calc(var(--preview-padding) * 0.75)',
          }}
        >
          {/* タイトル行 */}
          <div
            className="h-3 rounded mb-2 opacity-80"
            style={{
              backgroundColor: 'var(--preview-text)',
              borderRadius: 'calc(var(--preview-border-radius) * 0.5)',
            }}
          />
          
          {/* 本文行 */}
          <div className="space-y-1">
            <div
              className="h-2 rounded opacity-60"
              style={{
                backgroundColor: 'var(--preview-subtext)',
                borderRadius: 'calc(var(--preview-border-radius) * 0.5)',
                width: '90%',
              }}
            />
            <div
              className="h-2 rounded opacity-60"
              style={{
                backgroundColor: 'var(--preview-subtext)',
                borderRadius: 'calc(var(--preview-border-radius) * 0.5)',
                width: '75%',
              }}
            />
          </div>

          {/* アクセント要素（ボタン風） */}
          <div
            className="mt-3 inline-block px-2 py-1 rounded text-xs"
            style={{
              backgroundColor: 'var(--preview-accent)',
              color: 'var(--preview-bg)',
              borderRadius: 'calc(var(--preview-border-radius) * 0.5)',
              fontSize: 'calc(var(--preview-font-size) * 0.7)',
            }}
          >
            Sample
          </div>
        </div>
      </div>

      {/* お気に入りボタン */}
      {showFavoriteButton && (
        <button
          onClick={handleFavoriteClick}
          className={`absolute top-2 right-2 p-1 rounded-full transition-all ${
            theme.isFavorited
              ? 'text-red-500 bg-white shadow-sm'
              : 'text-gray-400 bg-white/80 opacity-0 group-hover:opacity-100'
          }`}
          title={theme.isFavorited ? 'お気に入りから削除' : 'お気に入りに追加'}
        >
          <svg
            className="w-4 h-4"
            fill={theme.isFavorited ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
        </button>
      )}

      {/* システムテーマバッジ */}
      {theme.isSystem && (
        <div className="absolute bottom-2 left-2">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            システム
          </span>
        </div>
      )}

      {/* 使用回数 */}
      {theme.usageCount > 0 && (
        <div className="absolute bottom-2 right-2">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            {theme.usageCount}
          </span>
        </div>
      )}
    </div>
  );
};
import React, { useState, useMemo } from 'react';
import { ThemePreview } from './ThemePreview';
import { useSystemThemes, usePublicThemes, useAddToFavoriteThemes, useRemoveFromFavoriteThemes } from '../../hooks/useThemeQueries';
import type { Theme, ThemeCategory } from '../../types/theme';

interface ThemeSelectorProps {
  selectedThemeId?: string;
  onThemeSelect: (theme: Theme) => void;
  showFavorites?: boolean;
  className?: string;
}

const CATEGORIES: { value: ThemeCategory; label: string }[] = [
  { value: 'basic', label: 'ベーシック' },
  { value: 'business', label: 'ビジネス' },
  { value: 'study', label: '学習' },
  { value: 'creative', label: 'クリエイティブ' },
  { value: 'seasonal', label: '季節' },
  { value: 'accessibility', label: 'アクセシビリティ' },
];

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  selectedThemeId,
  onThemeSelect,
  showFavorites = true,
  className = '',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<ThemeCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // テーマデータ取得
  const { data: systemThemes = [], isLoading: isLoadingSystem } = useSystemThemes();
  const { data: publicThemes = [], isLoading: isLoadingPublic } = usePublicThemes();

  // お気に入り操作
  const addToFavorites = useAddToFavoriteThemes();
  const removeFromFavorites = useRemoveFromFavoriteThemes();

  // 全テーマを統合してフィルタリング
  const filteredThemes = useMemo(() => {
    const allThemes = [...systemThemes, ...publicThemes];
    
    // 重複IDを排除（最初に見つかったものを使用）
    const uniqueThemes = allThemes.reduce((acc, theme) => {
      if (!acc.find(t => t.id === theme.id)) {
        acc.push(theme);
      }
      return acc;
    }, [] as Theme[]);
    
    return uniqueThemes.filter(theme => {
      // カテゴリフィルター
      if (selectedCategory !== 'all') {
        // システムテーマの場合、プリセットデータから推測
        const themeCategory = getThemeCategory(theme.name);
        if (themeCategory !== selectedCategory) {
          return false;
        }
      }

      // 検索クエリフィルター
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          theme.name.toLowerCase().includes(query) ||
          (theme.description && theme.description.toLowerCase().includes(query))
        );
      }

      return true;
    });
  }, [systemThemes, publicThemes, selectedCategory, searchQuery]);

  // テーマ名からカテゴリを推測する関数
  const getThemeCategory = (themeName: string): ThemeCategory => {
    const nameMap: Record<string, ThemeCategory> = {
      'クリーンホワイト': 'basic',
      'ソフトグレー': 'basic',
      'ダークモード': 'basic',
      'ナチュラルグリーン': 'basic',
      'ウォームベージュ': 'basic',
      'プロフェッショナル': 'business',
      'エグゼクティブ': 'business',
      'スタディブルー': 'study',
      'アカデミック': 'study',
      'アーティスト': 'creative',
      'ヴィンテージ': 'creative',
      'サクラピンク': 'seasonal',
      'オーシャンブルー': 'seasonal',
      'ハイコントラスト': 'accessibility',
      'セピア護眼': 'accessibility',
    };
    return nameMap[themeName] || 'basic';
  };

  const handleFavoriteToggle = (themeId: string, isFavorited: boolean) => {
    if (isFavorited) {
      removeFromFavorites.mutate(themeId);
    } else {
      addToFavorites.mutate(themeId);
    }
  };

  const isLoading = isLoadingSystem || isLoadingPublic;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 検索とフィルター */}
      <div className="space-y-3">
        {/* 検索バー */}
        <div className="relative">
          <input
            type="text"
            placeholder="テーマを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <svg
            className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* カテゴリフィルター */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              selectedCategory === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            すべて
          </button>
          {CATEGORIES.map((category) => (
            <button
              key={category.value}
              onClick={() => setSelectedCategory(category.value)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                selectedCategory === category.value
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {/* ローディング表示 */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* テーマ一覧 */}
      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredThemes.map((theme) => (
            <ThemePreview
              key={theme.id}
              theme={theme}
              isSelected={selectedThemeId === theme.id}
              onClick={() => onThemeSelect(theme)}
              showFavoriteButton={showFavorites}
              onFavoriteToggle={handleFavoriteToggle}
              className="h-32"
            />
          ))}
        </div>
      )}

      {/* 検索結果が空の場合 */}
      {!isLoading && filteredThemes.length === 0 && (
        <div className="text-center py-8">
          <div className="text-gray-500 dark:text-gray-400">
            {searchQuery || selectedCategory !== 'all'
              ? '条件に一致するテーマが見つかりませんでした'
              : 'テーマが見つかりませんでした'}
          </div>
          {(searchQuery || selectedCategory !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="mt-2 text-blue-500 hover:text-blue-600 text-sm"
            >
              フィルターをクリア
            </button>
          )}
        </div>
      )}

      {/* 統計情報 */}
      {!isLoading && filteredThemes.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
          {filteredThemes.length}個のテーマが見つかりました
        </div>
      )}
    </div>
  );
};
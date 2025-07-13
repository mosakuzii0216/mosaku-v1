import React, { useState, useRef, useEffect } from 'react';
import { useTagStore } from '../../stores/useTagStore';
import { useTagQueries } from '../../hooks/useTagQueries';
import { TagChip } from './TagChip';
import type { Tag } from '../../types/tag';

interface TagSelectorProps {
  selectedTagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
  className?: string;
}

export const TagSelector: React.FC<TagSelectorProps> = ({
  selectedTagIds,
  onTagsChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { tags, getFilteredTags } = useTagStore();
  const { createTag, isCreating } = useTagQueries();
  
  const selectedTags = tags.filter(tag => selectedTagIds.includes(tag.id));
  const availableTags = getFilteredTags().filter(tag => 
    !selectedTagIds.includes(tag.id) &&
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTagSelect = (tag: Tag) => {
    onTagsChange([...selectedTagIds, tag.id]);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleTagRemove = (tagId: string) => {
    onTagsChange(selectedTagIds.filter(id => id !== tagId));
  };

  const handleInputClick = () => {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleCreateNewTag = async () => {
    if (!searchQuery.trim()) return;
    
    const colors = ['#FF5733', '#33FF57', '#3357FF', '#FF33F5', '#F5FF33'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    try {
      const newTag = await createTag({ name: searchQuery.trim(), color: randomColor });
      onTagsChange([...selectedTagIds, newTag.id]);
      setSearchQuery('');
      setIsOpen(false);
    } catch (error) {
      alert(`タグの作成に失敗しました: ${error.message || error}`);
    }
  };

  const canCreateNewTag = searchQuery.trim();

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div
        className="min-h-[40px] p-2 border border-gray-300 rounded-md bg-white cursor-text flex flex-wrap gap-1 items-center"
        onClick={handleInputClick}
      >
        {selectedTags.map(tag => (
          <TagChip
            key={tag.id}
            tag={tag}
            onRemove={() => handleTagRemove(tag.id)}
          />
        ))}
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={selectedTags.length === 0 ? "タグを検索..." : ""}
          className="flex-1 min-w-[100px] outline-none text-sm"
          onFocus={() => setIsOpen(true)}
        />
      </div>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {/* 新しいタグ作成オプション */}
          {canCreateNewTag && (
            <div
              className="p-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
              onClick={handleCreateNewTag}
            >
              <div className="flex items-center gap-2 text-blue-600">
                <span>+ 新しいタグ「{searchQuery}」を作成</span>
                {isCreating && <span className="text-xs">作成中...</span>}
              </div>
            </div>
          )}
          
          {/* 既存タグ一覧 */}
          {availableTags.length === 0 && !canCreateNewTag ? (
            <div className="p-3 text-gray-500 text-sm">
              {searchQuery ? `"${searchQuery}" に一致するタグが見つかりません` : 'タグがありません'}
            </div>
          ) : (
            availableTags.map(tag => (
              <div
                key={tag.id}
                className="p-2 hover:bg-gray-50 cursor-pointer"
                onClick={() => handleTagSelect(tag)}
              >
                <TagChip tag={tag} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
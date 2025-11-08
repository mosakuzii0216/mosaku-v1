import { useEffect, useRef, useState } from 'react';
import { useTagStore } from '../../stores/useTagStore';

interface TagDropdownIconProps {
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  className?: string;
}

export const TagDropdownIcon = ({ selectedTagIds, onToggleTag, className = '' }: TagDropdownIconProps) => {
  const { tags } = useTagStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-label="タグを選択"
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
        title="タグを選択"
      >
        {/* Tag icon (simple inline SVG) */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-600 dark:text-gray-300">
          <path d="M21.41 11.58 12.42 2.59A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .59 1.41l8.99 8.99a2 2 0 0 0 2.83 0l7-7a2 2 0 0 0 0-2.82ZM6.5 7A1.5 1.5 0 1 1 8 5.5 1.5 1.5 0 0 1 6.5 7Z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 max-h-64 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg z-10">
          <div className="py-1">
            {tags.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">タグがありません</div>
            ) : (
              tags.map((tag) => {
                const active = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => onToggleTag(tag.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      active ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                    <span className="flex-1">{tag.name}</span>
                    {active && (
                      <span className="text-xs text-blue-600 dark:text-blue-400">選択中</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};


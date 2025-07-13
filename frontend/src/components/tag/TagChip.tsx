import React from 'react';
import type { Tag } from '../../types/tag';

interface TagChipProps {
  tag: Tag;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}

export const TagChip: React.FC<TagChipProps> = ({
  tag,
  selected = false,
  onClick,
  onRemove,
  className = '',
}) => {
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
        border border-gray-200 cursor-pointer transition-all duration-200
        ${selected 
          ? 'bg-blue-100 border-blue-300 text-blue-800' 
          : 'bg-white hover:bg-gray-50'
        }
        ${className}
      `}
      style={{
        backgroundColor: selected ? `${tag.color}20` : undefined,
        borderColor: selected ? tag.color : undefined,
        color: selected ? tag.color : undefined,
      }}
      onClick={onClick}
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      <span>{tag.name}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 text-gray-400 hover:text-gray-600"
          aria-label={`Remove ${tag.name} tag`}
        >
          ×
        </button>
      )}
    </span>
  );
};
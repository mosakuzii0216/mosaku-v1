import type { Memo } from '../../types/memo';
import { useMemoStore } from '../../stores/useMemoStore';
import { TagChip } from '../tag/TagChip';
import type { ViewDensity } from './MemoList';

interface MemoItemProps {
	memo: Memo;
	density?: ViewDensity;
}

export const MemoItem = ({ memo, density = 'normal' }: MemoItemProps) => {
	const { goToEdit, logCurrent } = useMemoStore();

	const formatDate = (dateString: string) => {
		const date = new Date(dateString);
		const now = new Date();
		const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

		if (diffInHours < 24) {
			return date.toLocaleTimeString('ja-JP', {
				hour: '2-digit',
				minute: '2-digit',
			});
		} else {
			return date.toLocaleDateString('ja-JP', {
				month: 'short',
				day: 'numeric',
			});
		}
	};

	const getPreview = (content: string, maxLength: number = 100) => {
		// HTMLタグを除去してプレーンテキストを取得
		const plainText = content.replace(/<[^>]*>/g, '');
		return plainText.length > maxLength ? plainText.substring(0, maxLength) + '...' : plainText;
	};

	// コンパクトビュー（1行表示）
	if (density === 'compact') {
		return (
			<div
				onClick={() => {
					goToEdit(memo);
					logCurrent();
				}}
				className="flex items-center justify-between py-2 px-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
			>
				<div className="flex items-center gap-2 flex-1 min-w-0">
					{memo.theme && (
						<div
							className="w-2 h-2 rounded-full border border-gray-300 flex-shrink-0"
							style={{
								backgroundColor: memo.theme.styles?.colors?.accentColor || '#3B82F6',
							}}
							title={`テーマ: ${memo.theme.name}`}
						/>
					)}
					<span className="font-medium text-gray-900 truncate">{memo.title || '無題'}</span>
					{memo.memoTags && memo.memoTags.length > 0 && (
						<span className="text-xs text-gray-500">({memo.memoTags.length})</span>
					)}
				</div>
				<span className="text-xs text-gray-500 whitespace-nowrap ml-2">
					{formatDate(memo.updatedAt)}
				</span>
			</div>
		);
	}

	// 通常ビュー（デフォルト）
	return (
		<div
			onClick={() => {
				goToEdit(memo);
				logCurrent();
			}}
			className="p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
		>
			<div className="flex justify-between items-start mb-2">
				<h3 className="font-medium text-gray-900 truncate flex-1 mr-2">{memo.title || '無題'}</h3>
				<div className="flex items-center space-x-2">
					{/* テーマインジケーター */}
					{memo.theme && (
						<div
							className="w-3 h-3 rounded-full border border-gray-300"
							style={{
								backgroundColor: memo.theme.styles?.colors?.accentColor || '#3B82F6',
							}}
							title={`テーマ: ${memo.theme.name}`}
						/>
					)}
					<span className="text-xs text-gray-500 whitespace-nowrap">
						{formatDate(memo.updatedAt)}
					</span>
				</div>
			</div>

			{memo.content && (
				<p className="text-sm text-gray-600 line-clamp-2 mb-2">{getPreview(memo.content)}</p>
			)}

			{/* メタ情報（タグとテーマ） */}
			<div className="flex items-center justify-between mt-2">
				{/* タグ表示 */}
				<div className="flex flex-wrap gap-1 flex-1">
					{memo.memoTags &&
						memo.memoTags.length > 0 &&
						memo.memoTags.map((memoTag) => (
							<TagChip key={memoTag.tag.id} tag={memoTag.tag} onClick={() => {}} />
						))}
				</div>

				{/* テーマ名表示 */}
				{memo.theme && (
					<span className="text-xs text-gray-500 ml-2 truncate">{memo.theme.name}</span>
				)}
			</div>
		</div>
	);
};

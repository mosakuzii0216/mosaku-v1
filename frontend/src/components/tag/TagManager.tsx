import React, { useState, useEffect } from 'react';
import { useTagQueries } from '../../hooks/useTagQueries';
import { useTagStore } from '../../stores/useTagStore';
import { TagForm } from './TagForm';
import { TagChip } from './TagChip';
import type { Tag, CreateTagDto, UpdateTagDto } from '../../types/tag';

export const TagManager: React.FC = () => {
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [editingTag, setEditingTag] = useState<Tag | null>(null);
	const [searchQuery, setSearchQuery] = useState('');

	const { tags, setSearchQuery: setStoreSearchQuery, getFilteredTags } = useTagStore();
	const { tagsQuery, createTag, updateTag, deleteTag, isCreating, isUpdating, isDeleting } =
		useTagQueries();

	// Sync tags data to store
	useEffect(() => {
		if (tagsQuery.data) {
			useTagStore.getState().setTags(tagsQuery.data);
		}
	}, [tagsQuery.data]);

	// Update store search query
	useEffect(() => {
		setStoreSearchQuery(searchQuery);
	}, [searchQuery, setStoreSearchQuery]);

	const filteredTags = getFilteredTags();

	const handleCreateTag = async (data: CreateTagDto | UpdateTagDto) => {
		try {
			await createTag(data as CreateTagDto);
			setShowCreateForm(false);
		} catch (error) {
			let errorMessage = 'タグの作成に失敗しました';
			if (error instanceof Error) {
				if (error.message.includes('401') || error.message.includes('認証')) {
					errorMessage = '認証エラーが発生しました。再度ログインしてください。';
				} else {
					errorMessage = `タグの作成に失敗しました: ${error.message}`;
				}
			}
			alert(errorMessage);
		}
	};

	const handleUpdateTag = async (data: CreateTagDto | UpdateTagDto) => {
		if (!editingTag) return;

		try {
			await updateTag({ id: editingTag.id, data: data as UpdateTagDto });
			setEditingTag(null);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			alert(`タグの更新に失敗しました: ${message}`);
		}
	};

	const handleDeleteTag = (tag: Tag) => {
		if (
			window.confirm(`「${tag.name}」タグを削除しますか？\n関連するメモからもタグが削除されます。`)
		) {
			deleteTag(tag.id);
		}
	};

	const handleEditClick = (tag: Tag) => {
		setEditingTag(tag);
		setShowCreateForm(false);
	};

	const handleCancelEdit = () => {
		setEditingTag(null);
		setShowCreateForm(false);
	};

	return (
		<div className="flex flex-col h-full">
			{/* ヘッダー */}
			<div className="border-b border-gray-200 p-4 bg-white">
				<div className="flex items-center justify-between mb-4">
					<h1 className="text-2xl font-bold text-gray-900">タグ管理</h1>
					<button
						onClick={() => {
							setShowCreateForm(true);
							setEditingTag(null);
						}}
						disabled={isCreating}
						className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:bg-gray-300 transition-colors"
					>
						+ 新しいタグ
					</button>
				</div>

				{/* 検索バー */}
				<div className="mb-4">
					<input
						type="text"
						placeholder="タグを検索..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				{/* タグ数表示 */}
				<div className="text-sm text-gray-600">
					{filteredTags.length} / {tags.length} タグ
				</div>
			</div>

			{/* メインコンテンツ */}
			<div className="flex-1 overflow-y-auto p-4 bg-gray-50">
				<div className="max-w-4xl mx-auto">
					{/* タグ作成・編集フォーム */}
					{(showCreateForm || editingTag) && (
						<div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 shadow-sm">
							<h3 className="text-lg font-semibold mb-4 text-gray-900">
								{editingTag ? 'タグを編集' : '新しいタグを作成'}
							</h3>
							<TagForm
								tag={editingTag || undefined}
								onSubmit={editingTag ? handleUpdateTag : handleCreateTag}
								onCancel={handleCancelEdit}
								isLoading={isCreating || isUpdating}
							/>
						</div>
					)}

					{/* タグ一覧 */}
					{tagsQuery.isLoading ? (
						<div className="flex items-center justify-center py-8">
							<div className="text-gray-500">読み込み中...</div>
						</div>
					) : tagsQuery.error ? (
						<div className="text-red-500 text-center py-8">
							<div className="mb-2">タグの読み込みに失敗しました</div>
							<div className="text-sm text-red-400">
								エラー: {tagsQuery.error.message || 'Unknown error'}
							</div>
							<button
								onClick={() => tagsQuery.refetch()}
								className="mt-2 px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
							>
								再試行
							</button>
						</div>
					) : filteredTags.length === 0 ? (
						<div className="text-center py-8 text-gray-500">
							{searchQuery ? '検索結果がありません' : 'タグがありません'}
						</div>
					) : (
						<div className="space-y-3">
							{filteredTags.map((tag) => (
								<div
									key={tag.id}
									className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
								>
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-3">
											<TagChip tag={tag} />
											<div className="text-sm text-gray-500">
												作成日: {new Date(tag.createdAt).toLocaleDateString('ja-JP')}
											</div>
										</div>

										<div className="flex items-center gap-2">
											<button
												onClick={() => handleEditClick(tag)}
												disabled={isUpdating}
												className="text-blue-600 hover:text-blue-800 px-3 py-1 rounded border border-blue-200 hover:bg-blue-50 disabled:opacity-50 transition-colors"
											>
												編集
											</button>
											<button
												onClick={() => handleDeleteTag(tag)}
												disabled={isDeleting}
												className="text-red-600 hover:text-red-800 px-3 py-1 rounded border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors"
											>
												削除
											</button>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

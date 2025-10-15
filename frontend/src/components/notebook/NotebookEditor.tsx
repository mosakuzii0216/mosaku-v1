import { RichTextEditor } from '../editor/RichTextEditor';
import { useMemoStore } from '../../stores/useMemoStore';

interface NotebookEditorProps {
	isCreate?: boolean;
}

export const NotebookEditor = ({ isCreate = false }: NotebookEditorProps) => {
	const { goToList } = useMemoStore();

	return (
		<div className="flex flex-col h-full">
			{/* ヘッダー */}
			<div className="border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
				<div className="flex items-center space-x-2">
					<button className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
						保存
					</button>
				</div>
			</div>
			{/* エディター */}
			<div className="flex-1 flex flex-col p-4 bg-white dark:bg-gray-900">
				{/* TODO: ノートブックテーマをstyle={}で反映 */}
				<div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
					{/* ノートブック名入力欄 
                        TODO: onChange={}でノートブック名の状態管理
                        TODO: style={}でノートブックテーマ反映
                     */}
					<div className="mb-4">
						<input
							type="text"
							placeholder="ノートブック名を入力"
							className="text-2xl font-bold border-none outline-none placeholder-gray-400 dark:text-white bg-transparent w-full"
						/>
					</div>

					{/* テーマ選択エリア TODO:テーマ機能をどうするかから検討 */}
					<div className="mb-4">
						<select className="border-none outline-none dark:text-white bg-transparent w-full">
							<option value="default">デフォルト</option>
							<option value="dark">ダーク</option>
							<option value="light">ライト</option>
						</select>
					</div>
					{/* TODO:テーマ選択UI */}
				</div>
			</div>
		</div>
	);
};

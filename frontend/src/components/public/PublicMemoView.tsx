import { Link } from 'react-router';
import { PublicMemoRenderer } from './PublicMemoRenderer';
import type { PublicMemoResponseDto } from '../../types/memo';

interface PublicMemoViewProps {
	memo: PublicMemoResponseDto;
}

export const PublicMemoView: React.FC<PublicMemoViewProps> = ({ memo }) => {
	const formattedDate = new Date(memo.updatedAt).toLocaleDateString('ja-JP', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});

	return (
		<div className="min-h-screen bg-gray-50 flex flex-col">
			<main className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">
				<h1 className="text-3xl font-bold text-gray-900 mb-2">{memo.title}</h1>
				<p className="text-sm text-gray-500 mb-8">最終更新: {formattedDate}</p>

				<div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
					<PublicMemoRenderer content={memo.content} />
				</div>
			</main>

			<footer className="border-t border-gray-200 bg-white">
				<div className="max-w-3xl mx-auto w-full px-4 py-6 text-center">
					<p className="text-sm text-gray-600 mb-3">
						これは閲覧専用の公開メモです。Mosaku は招待制のメモアプリです。
					</p>
					<Link
						to="https://mosaku.jp/invite"
						className="inline-block px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
					>
						Mosaku に参加する
					</Link>
				</div>
			</footer>
		</div>
	);
};

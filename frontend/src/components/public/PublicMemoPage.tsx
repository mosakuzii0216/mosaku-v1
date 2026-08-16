import { useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { usePublicMemo } from '../../hooks/useMemoSharingQueries';
import { PublicMemoView } from './PublicMemoView';

export const PublicMemoPage: React.FC = () => {
	const { token = '' } = useParams<{ token: string }>();
	const { data, isLoading, isError } = usePublicMemo(token);

	useEffect(() => {
		if (data?.title) {
			document.title = `${data.title} | Mosaku`;
		} else {
			document.title = 'Mosaku';
		}
		return () => {
			document.title = 'Mosaku';
		};
	}, [data?.title]);

	if (isLoading) {
		return (
			<div className="flex justify-center items-center min-h-screen" role="status">
				<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
			</div>
		);
	}

	if (isError || !data) {
		return (
			<div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
				<p className="text-gray-700 text-lg mb-2">メモが存在しないか、公開が解除されています。</p>
				<p className="text-gray-500 text-sm mb-6">URLが正しいかご確認ください。</p>
				<Link to="/" className="text-green-600 hover:underline text-sm">
					Mosaku トップへ戻る
				</Link>
			</div>
		);
	}

	return <PublicMemoView memo={data} />;
};

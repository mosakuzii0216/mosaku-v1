import { useEffect } from 'react';
import { useTagQueries } from './useTagQueries';

export const useAppInit = () => {
	const { tagsQuery } = useTagQueries();

	useEffect(() => {
		// アプリ起動時にタグをロード
		tagsQuery.refetch();
	}, []);

	return {
		isLoading: tagsQuery.isLoading,
		error: tagsQuery.error,
	};
};

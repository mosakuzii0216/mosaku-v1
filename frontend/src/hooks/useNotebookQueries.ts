import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../utils/api';
import type { CreateNotebookDto, UpdateNotebookDto } from '../types/notebook';
import { queryKeys } from '../constants/queryKeys';
import { ENTITY_CACHE_CONFIG } from '../constants/cacheConfig';

export const useNotebooks = () => {
	return useQuery({
		queryKey: queryKeys.notebooks.all,
		queryFn: () => apiClient.getNotebooks(),
		...ENTITY_CACHE_CONFIG.notebooks.list,
	});
};

export const useCreateNotebook = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (data: CreateNotebookDto) => apiClient.createNotebook(data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.notebooks.all });
		},
	});
};

export const useNotebook = (id?: string, enabled: boolean = true) => {
	return useQuery({
		queryKey: id ? queryKeys.notebooks.detail(id) : (['notebooks', '__none__'] as const),
		queryFn: () => apiClient.getNotebook(id as string),
		enabled: !!id && enabled,
		...ENTITY_CACHE_CONFIG.notebooks.detail,
	});
};

export const useUpdateNotebook = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateNotebookDto }) =>
			apiClient.updateNotebook(id, data),
		onSuccess: (_res, vars) => {
			qc.invalidateQueries({ queryKey: queryKeys.notebooks.detail(vars.id) });
			qc.invalidateQueries({ queryKey: queryKeys.notebooks.all });
		},
	});
};

export const useDeleteNotebook = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => apiClient.deleteNotebook(id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.notebooks.all });
		},
	});
};

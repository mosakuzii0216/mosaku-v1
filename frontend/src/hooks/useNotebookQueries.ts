import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../utils/api';
import type { CreateNotebookDto, UpdateNotebookDto } from '../types/notebook';

const keys = {
	all: ['notebooks'] as const,
	detail: (id: string) => ['notebooks', id] as const,
};

export const useNotebooks = () => {
	return useQuery({
		queryKey: keys.all,
		queryFn: () => apiClient.getNotebooks(),
	});
};

export const useCreateNotebook = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (data: CreateNotebookDto) => apiClient.createNotebook(data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: keys.all });
		},
	});
};

export const useNotebook = (id?: string, enabled: boolean = true) => {
	return useQuery({
		queryKey: id ? keys.detail(id) : (['notebooks', '__none__'] as const),
		queryFn: () => apiClient.getNotebook(id as string),
		enabled: !!id && enabled,
	});
};

export const useUpdateNotebook = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateNotebookDto }) =>
			apiClient.updateNotebook(id, data),
		onSuccess: (_res, vars) => {
			qc.invalidateQueries({ queryKey: keys.detail(vars.id) });
			qc.invalidateQueries({ queryKey: keys.all });
		},
	});
};

export const useDeleteNotebook = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => apiClient.deleteNotebook(id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: keys.all });
		},
	});
};

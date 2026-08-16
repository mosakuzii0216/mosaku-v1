import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../utils/api';
import type { SubmitFeedbackDto } from '../types/feedback';

export function useFeedbackQueries() {
	const mutation = useMutation<void, Error, SubmitFeedbackDto>({
		mutationFn: (dto) => apiClient.submitFeedback(dto),
	});

	return {
		submitFeedback: mutation.mutateAsync,
		isSubmitting: mutation.isPending,
	};
}

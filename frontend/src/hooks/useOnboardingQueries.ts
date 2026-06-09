import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import { apiClient } from '../utils/api';
import { queryKeys } from '../constants/queryKeys';
import { useAuth } from '../contexts/AuthContext';
import { useViewStore } from '../stores/useViewStore';
import { useOnboardingStore } from '../stores/useOnboardingStore';

export function useCompleteOnboarding() {
	const qc = useQueryClient();
	const { refreshUser, user } = useAuth();
	const { goToMemosForNotebook } = useViewStore();
	const { close } = useOnboardingStore();

	const mutation = useMutation({
		mutationFn: (themeId: string) => apiClient.completeOnboarding(themeId),
		onSuccess: async (data) => {
			await refreshUser();
			qc.invalidateQueries({ queryKey: queryKeys.notebooks.all });
			goToMemosForNotebook(data.notebookId);
			close();
		},
		onError: (error) => {
			Sentry.withScope((scope) => {
				scope.setTag('feature_area', 'onboarding');
				scope.setTag('step', 'complete');
				if (user) scope.setTag('userId', user.id);
				Sentry.captureException(error);
			});
			close();
		},
	});

	return {
		completeOnboarding: mutation.mutate,
		isPending: mutation.isPending,
	};
}

export function useSkipOnboarding() {
	const { refreshUser, user } = useAuth();
	const { close } = useOnboardingStore();

	const mutation = useMutation({
		mutationFn: () => apiClient.skipOnboarding(),
		onSuccess: async () => {
			await refreshUser();
			close();
		},
		onError: (error) => {
			Sentry.withScope((scope) => {
				scope.setTag('feature_area', 'onboarding');
				scope.setTag('step', 'skip');
				if (user) scope.setTag('userId', user.id);
				Sentry.captureException(error);
			});
			close();
		},
	});

	return {
		skipOnboarding: mutation.mutate,
		isPending: mutation.isPending,
	};
}

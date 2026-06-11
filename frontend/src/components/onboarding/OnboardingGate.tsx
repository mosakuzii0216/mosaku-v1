import { useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboardingStore } from '../../stores/useOnboardingStore';

export function OnboardingGate() {
	const { user } = useAuth();
	const open = useOnboardingStore((s) => s.open);

	useEffect(() => {
		if (user && !user.onboardingCompleted) open();
	}, [user, open]);

	return null;
}

import { useState, useEffect } from 'react';

export function useReducedMotion(): boolean {
	const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	});

	useEffect(() => {
		const mql = window.matchMedia('(prefers-reduced-motion: reduce)');

		const handleChange = (event: MediaQueryListEvent) => {
			setReducedMotion(event.matches);
		};

		mql.addEventListener('change', handleChange);

		return () => {
			mql.removeEventListener('change', handleChange);
		};
	}, []);

	return reducedMotion;
}

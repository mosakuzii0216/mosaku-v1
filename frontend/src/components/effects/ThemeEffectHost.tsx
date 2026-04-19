import { Suspense, lazy, useMemo, Component, type ReactNode } from 'react';
import type { ThemeMetadata } from '../../types/theme';
import { getEffectKey } from '../../types/theme';
import { resolveThemeEffect } from '../../themes/themeEffectRegistry';

interface MinimalTheme {
	id: string;
	name: string;
	metadata?: ThemeMetadata;
}

class EffectErrorBoundary extends Component<
	{ children: ReactNode; resetKey: string },
	{ hasError: boolean }
> {
	state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	static getDerivedStateFromProps(
		props: { resetKey: string },
		state: { hasError: boolean; prevKey?: string },
	) {
		if (props.resetKey !== state.prevKey) {
			return { hasError: false, prevKey: props.resetKey };
		}
		return null;
	}

	render() {
		if (this.state.hasError) return null;
		return this.props.children;
	}
}

interface ThemeEffectHostProps {
	theme: MinimalTheme | null;
}

export function ThemeEffectHost({ theme }: ThemeEffectHostProps) {
	const effectKey = getEffectKey(theme);
	const loader = resolveThemeEffect(effectKey);

	const LazyEffect = useMemo(() => {
		if (!loader) return null;
		return lazy(loader);
	}, [loader]);

	if (!LazyEffect) return null;

	return (
		<EffectErrorBoundary resetKey={effectKey ?? 'none'}>
			<Suspense fallback={null}>
				<LazyEffect key={effectKey ?? 'none'} />
			</Suspense>
		</EffectErrorBoundary>
	);
}

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useGuardedAutoUpdate', () => ({
	useGuardedAutoUpdate: vi.fn(),
}));

import { useGuardedAutoUpdate } from '../../hooks/useGuardedAutoUpdate';
import { SwAutoUpdater } from './SwAutoUpdater';

describe('SwAutoUpdater', () => {
	it('renders nothing (headless)', () => {
		vi.mocked(useGuardedAutoUpdate).mockReturnValue(undefined);
		const { container } = render(<SwAutoUpdater />);
		expect(container.firstChild).toBeNull();
	});

	it('calls useGuardedAutoUpdate on mount', () => {
		vi.mocked(useGuardedAutoUpdate).mockReturnValue(undefined);
		render(<SwAutoUpdater />);
		expect(useGuardedAutoUpdate).toHaveBeenCalled();
	});
});

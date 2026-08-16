import { Plus } from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';

export const NewMemoHero = () => {
	const { goToMemoCreate } = useNavigation();

	return (
		<div className="px-4 pt-4">
			<button
				onClick={goToMemoCreate}
				className="w-full py-4 rounded-xl font-semibold text-[var(--on-accent)] flex items-center justify-center gap-2 text-base"
				style={{ backgroundColor: 'var(--accent)' }}
			>
				<Plus className="w-5 h-5" />
				新しいメモを書く
			</button>
		</div>
	);
};

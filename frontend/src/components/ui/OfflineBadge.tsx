import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useSyncEngine } from '../../hooks/useSyncEngine';

export type OfflineBadgeVariant = 'header' | 'detail';

export interface OfflineBadgeProps {
	variant?: OfflineBadgeVariant;
	className?: string;
}

export function OfflineBadge({ variant = 'header', className = '' }: OfflineBadgeProps) {
	const { status } = useNetworkStatus();
	const { pendingCount } = useSyncEngine();

	const showStatusBadge = status === 'offline' || status === 'unstable';
	const showPendingBadge = pendingCount > 0;

	if (!showStatusBadge && !showPendingBadge) {
		return null;
	}

	const statusBadge =
		status === 'offline'
			? {
					label: 'オフライン',
					className: 'bg-red-100 text-red-700 border-red-300',
				}
			: status === 'unstable'
				? {
						label: '通信不安定',
						className: 'bg-amber-100 text-amber-700 border-amber-300',
					}
				: null;

	const pendingLabel = variant === 'detail' ? `未同期 ${pendingCount} 件` : String(pendingCount);

	return (
		<div
			data-testid="offline-badge-region"
			aria-live="polite"
			className={`inline-flex items-center gap-1.5 ${className}`}
		>
			{statusBadge && (
				<span
					data-testid="offline-badge-status"
					className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${statusBadge.className}`}
				>
					{statusBadge.label}
				</span>
			)}
			{showPendingBadge && (
				<span
					data-testid="offline-badge-pending"
					title={`未同期 ${pendingCount} 件`}
					className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300 text-xs font-medium"
				>
					{pendingLabel}
				</span>
			)}
		</div>
	);
}

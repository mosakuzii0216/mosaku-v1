import type { InvitationPerkView } from '../../types/invitation';

interface PerkBadgeProps {
	perk: InvitationPerkView;
}

export function PerkBadge({ perk }: PerkBadgeProps) {
	if (perk.type !== 'comp') return null;
	return (
		<div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-900/60 border border-emerald-500/50 text-emerald-300 text-sm font-medium">
			<span>🎁</span>
			<span>AI 無料枠つき（{perk.months} ヶ月）</span>
		</div>
	);
}

import { Link } from 'react-router';
import { MessageSquare } from 'lucide-react';

import { DebugPanel } from '../debug/DebugPanel';
import { InvitationCard } from './InvitationCard';
import { PublicMemosCard } from './PublicMemosCard';
import { useFeedbackStore } from '../../stores/useFeedbackStore';

export function SettingsPage() {
	const openFeedback = useFeedbackStore((s) => s.open);

	return (
		<div className="min-h-screen bg-gray-50">
			<header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center">
				<Link to="/" className="text-sm text-blue-600 hover:underline mr-4">
					← メモ一覧へ
				</Link>
				<h1 className="text-base font-semibold text-gray-800">設定</h1>
			</header>
			<main className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
				<section>
					<InvitationCard />
				</section>
				<section>
					<PublicMemosCard />
				</section>
				<section>
					<h2 className="text-sm font-semibold text-gray-700 mb-3">フィードバック</h2>
					<div className="bg-white rounded-lg border border-gray-200 p-4">
						<p className="text-sm text-gray-600 mb-3">
							不具合の報告や改善要望をお気軽にお送りください。
						</p>
						<button
							onClick={openFeedback}
							className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
						>
							<MessageSquare className="w-4 h-4 mr-2" />
							フィードバックを送る
						</button>
					</div>
				</section>
				<section>
					<h2 className="text-sm font-semibold text-gray-700 mb-3">開発者向け</h2>
					<DebugPanel />
				</section>
			</main>
		</div>
	);
}

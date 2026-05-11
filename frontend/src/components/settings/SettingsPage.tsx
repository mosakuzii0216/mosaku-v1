import { Link } from 'react-router';

import { DebugPanel } from '../debug/DebugPanel';

export function SettingsPage() {
	return (
		<div className="min-h-screen bg-gray-50">
			<header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center">
				<Link to="/" className="text-sm text-blue-600 hover:underline mr-4">
					← メモ一覧へ
				</Link>
				<h1 className="text-base font-semibold text-gray-800">設定</h1>
			</header>
			<main className="p-4 md:p-6 space-y-6">
				<section>
					<h2 className="text-sm font-semibold text-gray-700 mb-3">開発者向け</h2>
					<DebugPanel />
				</section>
			</main>
		</div>
	);
}

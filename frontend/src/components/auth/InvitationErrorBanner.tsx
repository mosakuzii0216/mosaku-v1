interface InvitationErrorBannerProps {
	message: string;
	onContinue: () => void;
}

export function InvitationErrorBanner({ message, onContinue }: InvitationErrorBannerProps) {
	return (
		<div
			role="alert"
			className="max-w-md w-full mx-auto p-6 bg-black/75 rounded-lg border border-red-300/30 shadow-2xl backdrop-blur-sm"
		>
			<h2 className="text-xl font-bold mb-4 text-center text-red-200">
				招待コードを確認できません
			</h2>
			<p className="mb-6 text-center text-red-100 whitespace-pre-wrap">{message}</p>
			<button
				type="button"
				onClick={onContinue}
				className="w-full bg-emerald-700 hover:bg-emerald-600 text-white py-2 px-4 rounded-lg font-medium transition-colors"
			>
				招待コードなしのトップへ戻る
			</button>
		</div>
	);
}

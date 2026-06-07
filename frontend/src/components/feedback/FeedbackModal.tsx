import { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { useFeedbackQueries } from '../../hooks/useFeedbackQueries';
import { ApiError } from '../../utils/apiError';
import type { FeedbackCategory } from '../../types/feedback';

interface FeedbackModalProps {
	isOpen: boolean;
	onClose(): void;
}

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
	{ value: 'bug', label: '不具合' },
	{ value: 'improvement', label: '改善要望' },
	{ value: 'other', label: 'その他' },
];

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
	const [category, setCategory] = useState<FeedbackCategory | null>(null);
	const [message, setMessage] = useState('');
	const [errors, setErrors] = useState<{ category?: string; message?: string }>({});
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [showSuccess, setShowSuccess] = useState(false);
	const { submitFeedback, isSubmitting } = useFeedbackQueries();

	const handleClose = useCallback(() => {
		setCategory(null);
		setMessage('');
		setErrors({});
		setSubmitError(null);
		setShowSuccess(false);
		onClose();
	}, [onClose]);

	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') handleClose();
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, handleClose]);

	useEffect(() => {
		if (!showSuccess) return;
		const timer = setTimeout(handleClose, 1500);
		return () => clearTimeout(timer);
	}, [showSuccess, handleClose]);

	if (!isOpen) return null;

	const validate = () => {
		const newErrors: { category?: string; message?: string } = {};
		if (!category) newErrors.category = 'カテゴリを選択してください';
		if (!message.trim()) newErrors.message = 'メッセージを入力してください';
		else if (message.length > 1000) newErrors.message = '1000文字以内で入力してください';
		return newErrors;
	};

	const handleSubmit = async () => {
		const validationErrors = validate();
		if (Object.keys(validationErrors).length > 0) {
			setErrors(validationErrors);
			return;
		}
		setErrors({});
		setSubmitError(null);
		try {
			await submitFeedback({ category: category!, message });
			setShowSuccess(true);
		} catch (err) {
			if (err instanceof ApiError && err.statusCode === 429) {
				setSubmitError('送信が多すぎます。しばらく待ってから再試行してください');
			} else {
				setSubmitError('送信に失敗しました。もう一度お試しください');
			}
		}
	};

	if (showSuccess) {
		return (
			<div
				className="fixed inset-0 z-50 flex items-center justify-center"
				data-testid="feedback-backdrop"
				onClick={handleClose}
			>
				<div className="absolute inset-0 bg-black/50" />
				<div
					role="dialog"
					aria-modal="true"
					aria-label="フィードバック送信"
					className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-8 z-10 text-center"
					onClick={(e) => e.stopPropagation()}
				>
					<CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
					<h3 className="text-lg font-semibold text-gray-900 mb-2">送信しました！</h3>
					<p className="text-sm text-gray-500">フィードバックありがとうございます。</p>
				</div>
			</div>
		);
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			data-testid="feedback-backdrop"
			onClick={handleClose}
		>
			<div className="absolute inset-0 bg-black/50" />
			<div
				role="dialog"
				aria-modal="true"
				aria-label="フィードバック送信"
				className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 z-10"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-semibold text-gray-900">フィードバックを送る</h2>
					<button
						onClick={handleClose}
						className="text-gray-400 hover:text-gray-600 transition-colors"
						aria-label="閉じる"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				{/* カテゴリ選択 */}
				<div className="mb-4">
					<p className="text-sm font-medium text-gray-700 mb-2">カテゴリ</p>
					<div className="flex gap-2">
						{CATEGORIES.map(({ value, label }) => (
							<button
								key={value}
								role="button"
								aria-pressed={category === value}
								onClick={() => {
									setCategory(value);
									setErrors((prev) => ({ ...prev, category: undefined }));
								}}
								className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
									category === value
										? 'bg-blue-600 text-white border-blue-600'
										: 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
								} ${errors.category ? 'border-red-400' : ''}`}
							>
								{label}
							</button>
						))}
					</div>
					{errors.category && <p className="mt-1 text-sm text-red-600">{errors.category}</p>}
				</div>

				{/* メッセージ入力 */}
				<div className="mb-4">
					<label className="block text-sm font-medium text-gray-700 mb-2">メッセージ</label>
					<textarea
						value={message}
						onChange={(e) => {
							setMessage(e.target.value);
							setErrors((prev) => ({ ...prev, message: undefined }));
						}}
						rows={5}
						placeholder="フィードバックをご記入ください..."
						className={`w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${
							errors.message ? 'border-red-400' : 'border-gray-300'
						}`}
					/>
					<div className="flex justify-between mt-1">
						{errors.message ? <p className="text-sm text-red-600">{errors.message}</p> : <span />}
						<span className={`text-xs ${message.length > 1000 ? 'text-red-600' : 'text-gray-400'}`}>
							{message.length} / 1000
						</span>
					</div>
				</div>

				{/* 送信エラー */}
				{submitError && <p className="mb-3 text-sm text-red-600">{submitError}</p>}

				{/* 送信ボタン */}
				<button
					onClick={handleSubmit}
					disabled={isSubmitting}
					className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
				>
					{isSubmitting ? '送信中...' : '送信する'}
				</button>
			</div>
		</div>
	);
}

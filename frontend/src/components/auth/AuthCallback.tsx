import { useEffect } from 'react';
import { useNavigate } from 'react-router';

export default function AuthCallback() {
	const navigate = useNavigate();

	useEffect(() => {
		// OAuth機能を削除したため、認証ページにリダイレクト
		navigate('/auth');
	}, [navigate]);

	return (
		<div className="flex justify-center items-center h-screen">
			<div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
		</div>
	);
}

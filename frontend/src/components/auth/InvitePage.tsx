import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useInvitationContext } from '../../hooks/useInvitationsQueries';
import { resolveInvitationErrorMessage } from '../../constants/invitationErrorMessages';
import { isApiError } from '../../utils/apiError';
import AuthForm from './AuthForm';
import { LoginPageLayout } from './LoginPageLayout';
import { InvitationErrorBanner } from './InvitationErrorBanner';

export default function InvitePage() {
	const { code = '' } = useParams<{ code: string }>();
	const navigate = useNavigate();
	const { user, loading: authLoading } = useAuth();

	useEffect(() => {
		if (!authLoading && user) {
			navigate('/', { replace: true });
		}
	}, [user, authLoading, navigate]);

	const enabled = !authLoading && !user && !!code;
	const queryCode = enabled ? code : '';
	const { data, error, isLoading } = useInvitationContext({ code: queryCode });

	if (authLoading) {
		return (
			<LoginPageLayout>
				<div className="max-w-md w-full mx-auto p-6 text-center text-green-100">読み込み中...</div>
			</LoginPageLayout>
		);
	}

	if (user) {
		return null;
	}

	if (isLoading) {
		return (
			<LoginPageLayout>
				<div className="max-w-md w-full mx-auto p-6 text-center text-green-100">
					招待コードを確認しています...
				</div>
			</LoginPageLayout>
		);
	}

	if (error || !data) {
		const errorCode = isApiError(error) ? error.code : null;
		const message = resolveInvitationErrorMessage(errorCode);
		return (
			<LoginPageLayout>
				<InvitationErrorBanner
					message={message}
					onContinue={() => navigate('/', { replace: true })}
				/>
			</LoginPageLayout>
		);
	}

	return <AuthForm prefilledInvitationCode={code} inviterContext={data} />;
}

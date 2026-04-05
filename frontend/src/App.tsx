import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { useViewStore } from './stores/useViewStore';
import { useWindowSize } from './hooks/useWindowSize';
import { MobileLayout } from './components/layouts/MobileLayout';
import { DesktopLayout } from './components/layouts/DesktopLayout';
import AuthGuard from './components/auth/AuthGuard';
import AuthCallback from './components/auth/AuthCallback';
import PasswordReset from './components/auth/PasswordReset';
import InvitationManager from './components/admin/InvitationManager';

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 1,
			refetchOnWindowFocus: false,
			staleTime: 5 * 60 * 1000, // 5分
			gcTime: 10 * 60 * 1000, // 10分
		},
	},
});

function AppContent() {
	const { isMobile, setIsMobile } = useViewStore();
	const { width } = useWindowSize();

	// レスポンシブ判定
	useEffect(() => {
		setIsMobile(width < 768);
	}, [width, setIsMobile]);

	if (isMobile) {
		return <MobileLayout />;
	}

	return <DesktopLayout />;
}

function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<Router>
					<Routes>
						<Route path="/auth/callback" element={<AuthCallback />} />
						<Route path="/auth/reset-password" element={<PasswordReset />} />
						<Route
							path="/admin/invitations"
							element={
								<AuthGuard>
									<InvitationManager />
								</AuthGuard>
							}
						/>
						<Route
							path="/*"
							element={
								<AuthGuard>
									<AppContent />
								</AuthGuard>
							}
						/>
					</Routes>
				</Router>
			</AuthProvider>
		</QueryClientProvider>
	);
}

export default App;

import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { useViewStore } from './stores/useViewStore';
import { useWindowSize } from './hooks/useWindowSize';
import { useSentryRouteTag } from './hooks/useSentryRouteTag';
import { MobileLayout } from './components/layouts/MobileLayout';
import { DesktopLayout } from './components/layouts/DesktopLayout';
import AuthGuard from './components/auth/AuthGuard';
import AuthCallback from './components/auth/AuthCallback';
import PasswordReset from './components/auth/PasswordReset';
import InvitePage from './components/auth/InvitePage';
import InvitationManager from './components/admin/InvitationManager';
import { SwUpdatePrompt } from './components/pwa/SwUpdatePrompt';
import { SyncToast } from './components/ui/SyncToast';
import { SettingsPage } from './components/settings/SettingsPage';
import { PublicMemoPage } from './components/public/PublicMemoPage';

const MOBILE_BREAKPOINT = 768;

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

function RouteTracker() {
	useSentryRouteTag();
	return null;
}

function AppContent() {
	const { isMobile, setIsMobile } = useViewStore();
	const { width } = useWindowSize();

	// レスポンシブ判定
	useEffect(() => {
		setIsMobile(width < MOBILE_BREAKPOINT);
	}, [width, setIsMobile]);

	if (isMobile) {
		return <MobileLayout />;
	}

	return <DesktopLayout />;
}

function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<SwUpdatePrompt />
			<SyncToast />
			<AuthProvider>
				<Router>
					<RouteTracker />
					<Routes>
						<Route path="/auth/callback" element={<AuthCallback />} />
						<Route path="/auth/reset-password" element={<PasswordReset />} />
						<Route path="/invite/:code" element={<InvitePage />} />
						<Route path="/p/:token" element={<PublicMemoPage />} />
						<Route
							path="/admin/invitations"
							element={
								<AuthGuard>
									<InvitationManager />
								</AuthGuard>
							}
						/>
						<Route
							path="/settings"
							element={
								<AuthGuard>
									<SettingsPage />
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

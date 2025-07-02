import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemoStore } from './stores/useMemoStore';
import { useWindowSize } from './hooks/useWindowSize';
import { MobileLayout } from './components/layouts/MobileLayout';
import { DesktopLayout } from './components/layouts/DesktopLayout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  const { isMobile, setIsMobile } = useMemoStore();
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
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;

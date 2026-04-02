import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { envValidator } from './utils/env';
import { logger } from './utils/logger';

Sentry.init({
	dsn: import.meta.env.VITE_SENTRY_DSN,
	integrations: [Sentry.browserTracingIntegration()],
	tracesSampleRate: import.meta.env.PROD ? 0.2 : 0,
	enabled: !!import.meta.env.VITE_SENTRY_DSN,
});

// アプリケーション起動前に環境変数を検証（fail-fast）
try {
	envValidator.validate();
} catch (error) {
	logger.error('Environment validation failed:', error);
	// エラーはアプリケーション起動を停止させるため、そのまま再スローする
	throw error;
}

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);

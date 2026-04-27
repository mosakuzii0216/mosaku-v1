import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { envValidator } from './utils/env';
import { logger } from './utils/logger';
import { initSentry } from './utils/sentry/init';

// アプリケーション起動前に環境変数を検証（fail-fast）
try {
	envValidator.validate();
} catch (error) {
	logger.error('Environment validation failed:', error);
	// エラーはアプリケーション起動を停止させるため、そのまま再スローする
	throw error;
}

initSentry();

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);

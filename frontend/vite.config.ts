import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { // ← このserverオブジェクトを追加
    host: true, // Dockerコンテナの外部からアクセスを許可
    port: 5173, // ポートを明示的に指定（任意ですが推奨）
  }
})

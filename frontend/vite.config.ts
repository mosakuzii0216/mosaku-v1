import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Dockerコンテナの外部からアクセスを許可
    port: 5173,
    hmr: {
      port: 5173,
      host: 'localhost'
    },
    watch: {
      usePolling: true
    }
  }
})

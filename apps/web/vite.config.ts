/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { manualChunks: { antd: ['antd', '@ant-design/icons'], charts: ['recharts'], tiptap: ['@tiptap/react', '@tiptap/starter-kit'] } } },
  },
  server: { port: 5173, // regex ^/api/ để không nuốt route SPA /api-keys
    proxy: { '^/api/': { target: process.env.VITE_API_TARGET ?? 'http://localhost:3000', changeOrigin: true } } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'], exclude: ['e2e/**', 'node_modules/**'] },
});

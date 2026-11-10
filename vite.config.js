import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 800 },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
  test: { root: '.', include: ['tests/**/*.test.js'] },
});

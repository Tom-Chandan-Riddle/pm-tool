import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API_ORIGIN = 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/projects': API_ORIGIN,
      '/health': API_ORIGIN,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});

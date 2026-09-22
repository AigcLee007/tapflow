import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    testTimeout: 30000,    
    environment: 'jsdom',
    exclude: ['**/dist/**', '**/node_modules/**'],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
